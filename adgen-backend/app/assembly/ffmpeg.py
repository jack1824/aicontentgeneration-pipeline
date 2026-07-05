"""FFmpeg assembly: stitch clips + overlay narration/music (proven commands, files 11/13).

Runs on the backend host (ffmpeg must be installed there — file 08). Helpers, matching
the audio strategy (file 04):
  - stitch()             concat clips (codec copy — clips from the same workflow share codec/res/fps)
  - stitch_and_overlay() silent video + narration on top (+ optional ducked music)  [AUDIO-AFTER]
  - stitch_plus_music()  video that already has audio (+ optional music bed)        [lipsync/LTX]
  - replace_audio()      swap a video's ENTIRE soundtrack for new narration (revoice/reassemble)
  - concat_reencode()    concat MIXED-SOURCE clips (sequence mode): re-encode video, give
                         silent clips a real silent track so audio streams line up

Gotcha (file 11): `-c copy` concat only works if all clips share codec/res/fps — true for
same-workflow clips; mixed sources go through concat_reencode() instead.
"""
import json
import re
import subprocess
import tempfile
from pathlib import Path

# Narration starts 300ms in (proven value; `|300` covers a 2nd channel if the file is stereo).
# `apad` extends the narration with silence so a SHORT narration never truncates the video
# via -shortest (which caps everything at the video's length).
NARRATION_DELAY_FILTER = "[1:a]adelay=300|300,apad[narr]"
MUSIC_DUCK_VOLUME = 0.15

# Audio-video fit: fixed-length video + variable-length narration never match by luck.
# Short narration -> trim the video to end a beat after the voice (kills the dead tail).
# Long narration -> speed it up imperceptibly (<=12%) so it fits instead of being cut.
# The trim is CAPPED: it exists to remove a small dead tail, never to shorten the ad —
# a 10s render with a 4s script keeps its full 10s of visuals (music/ambient runway).
FIT_TAIL_S = 0.45
FIT_MAX_TEMPO = 1.12
FIT_MAX_TRIM_S = 1.5


def _fit_narration(
    video_dur: float, narr_dur: float, delay_ms: int,
) -> tuple[float | None, float, str | None]:
    """Return (atempo_or_None, output_duration_s, warning_or_None) for a narration join."""
    delay = delay_ms / 1000.0
    tempo: float | None = None
    warning: str | None = None
    window = video_dur - delay
    audio_end = delay + narr_dur
    if window > 0.1 and narr_dur > window:
        t = narr_dur / window
        if t <= FIT_MAX_TEMPO:
            tempo = t
            audio_end = video_dur
        else:
            tempo = FIT_MAX_TEMPO
            audio_end = delay + narr_dur / FIT_MAX_TEMPO
            overrun = audio_end - video_dur
            warning = (f"narration runs ~{overrun:.1f}s past the video even at "
                       f"{FIT_MAX_TEMPO}x — shorten the script")
    out_t = min(video_dur, audio_end + FIT_TAIL_S)
    if video_dur - out_t > FIT_MAX_TRIM_S:
        gap = video_dur - audio_end
        out_t = video_dur
        warning = (f"narration ends ~{gap:.1f}s before the video — kept the full cut "
                   f"(Library → ✂ Fix timing to trim it on purpose)")
    return tempo, out_t, warning


def _narr_filter(delay_ms: int, gain: float = 1.0, tempo: float | None = None) -> str:
    """Narration filter chain: tempo BEFORE delay (the delay must not be sped up)."""
    parts = []
    if tempo and tempo > 1.001:
        parts.append(f"atempo={min(tempo, 2.0):.4f}")
    parts.append(f"adelay={delay_ms}|{delay_ms}")
    if abs(gain - 1.0) > 1e-6:
        parts.append(f"volume={gain}")
    parts.append("apad")
    return "[1:a]" + ",".join(parts) + "[narr]"


def detect_audio_end(path: str) -> float:
    """Last audible moment in a file: trailing-silence start via silencedetect,
    falling back to the full duration when there is no trailing silence."""
    proc = subprocess.run(
        ["ffmpeg", "-i", path, "-af", "silencedetect=noise=-45dB:d=0.3", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    dur = probe(path)["duration"]
    starts = [float(x) for x in re.findall(r"silence_start: ([0-9.]+)", proc.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", proc.stderr)]
    if starts:
        last_start = starts[-1]
        # Trailing silence = the last interval is unclosed OR its end sits at EOF
        # (silencedetect closes a run-to-end interval AT the file's end).
        matching_end = next((e for e in reversed(ends) if e > last_start), None)
        if matching_end is None or matching_end >= dur - 0.25:
            return last_start
    return dur


def trim_end(video: str, end_s: float, out: str) -> str:
    """Cut a video (and its audio) at end_s. Stream copy — frame-granular, no re-encode."""
    _run(["ffmpeg", "-y", "-i", video, "-t", f"{end_s:.3f}", "-c", "copy", out])
    return out


def _run(cmd: list[str]) -> None:
    """Run ffmpeg, surfacing stderr in the exception if it fails."""
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg failed (exit {proc.returncode}): {' '.join(cmd)}\n{proc.stderr[-2000:]}"
        )


def extract_frame(video: str, out: str, at_s: float = 0.0) -> str:
    """Grab one frame as a still image (avatar face gen: Wan renders a 1-frame
    'video' — this turns it into the PNG the profile stores)."""
    _run(["ffmpeg", "-y", "-ss", f"{at_s:.3f}", "-i", video, "-frames:v", "1", out])
    return out


def stitch(clips: list[str], out: str = "stitched.mp4") -> str:
    """Concat clips into one video (codec copy). Returns the output path."""
    if not clips:
        raise ValueError("stitch() needs at least one clip.")
    # concat demuxer needs a list file; use a temp file with absolute paths.
    with tempfile.NamedTemporaryFile(
        "w", suffix=".txt", delete=False, dir=str(Path(out).resolve().parent)
    ) as f:
        for c in clips:
            f.write(f"file '{Path(c).resolve()}'\n")
        list_path = f.name
    try:
        _run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_path,
              "-c", "copy", out])
    finally:
        Path(list_path).unlink(missing_ok=True)
    return out


def _stitched_path(out: str) -> str:
    """Intermediate stitched file, named after the final output (no collisions between jobs)."""
    p = Path(out).resolve()
    return str(p.with_name(p.stem + ".stitched.mp4"))


def stitch_and_overlay(
    clips: list[str],
    narration: str,
    music: str | None = None,
    out: str = "final.mp4",
    on_warning=None,
) -> str:
    """Stitch silent clips and lay narration on top (+ optional ducked music). [AUDIO-AFTER]

    Auto-fits audio to video: short narration trims the output to voice-end + tail;
    long narration is atempo'd (capped) into the window.
    """
    stitched = stitch(clips, out=_stitched_path(out))
    try:
        vdur = probe(stitched)["duration"]
        ndur = probe(narration)["duration"]
        tempo, out_t, warning = _fit_narration(vdur, ndur, 300)
        if warning and on_warning:
            on_warning(warning)
        narr = _narr_filter(300, tempo=tempo)
        if music:
            fc = (f"{narr};"
                  f"[2:a]volume={MUSIC_DUCK_VOLUME}[bg];"
                  f"[narr][bg]amix=inputs=2:duration=first[mix]")
            cmd = ["ffmpeg", "-y", "-i", stitched, "-i", narration, "-i", music,
                   "-filter_complex", fc,
                   "-map", "0:v", "-map", "[mix]", "-c:v", "copy", "-c:a", "aac",
                   "-t", f"{out_t:.3f}", out]
        else:
            cmd = ["ffmpeg", "-y", "-i", stitched, "-i", narration,
                   "-filter_complex", narr,
                   "-map", "0:v", "-map", "[narr]", "-c:v", "copy", "-c:a", "aac",
                   "-t", f"{out_t:.3f}", out]
        _run(cmd)
    finally:
        # ALWAYS drop the intermediate — a failed overlay must not leave a
        # *.stitched.mp4 posing as a final in the Library.
        Path(stitched).unlink(missing_ok=True)
    return out


def probe(path: str) -> dict:
    """Media facts via ffprobe: duration, has_audio, width/height/fps of the first
    video stream (0/None when absent)."""
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-show_format", "-show_streams",
         "-of", "json", path],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffprobe failed for {path}: {proc.stderr[-500:]}")
    info = json.loads(proc.stdout)
    width = height = 0
    fps = 0.0
    for s in info.get("streams", []):
        if s.get("codec_type") == "video":
            width = int(s.get("width") or 0)
            height = int(s.get("height") or 0)
            rate = s.get("avg_frame_rate") or "0/1"
            try:
                num, den = rate.split("/")
                fps = float(num) / float(den) if float(den) else 0.0
            except ValueError:
                fps = 0.0
            break
    return {
        "duration": float(info.get("format", {}).get("duration") or 0.0),
        "has_audio": any(s.get("codec_type") == "audio" for s in info.get("streams", [])),
        "width": width,
        "height": height,
        "fps": fps,
    }


def replace_audio(
    video: str,
    narration: str,
    music: str | None = None,
    out: str = "revoiced.mp4",
    narration_delay_ms: int = 300,
    narration_gain: float = 1.0,
    music_gain: float = MUSIC_DUCK_VOLUME,
    fit: bool = True,
    on_warning=None,
) -> str:
    """Replace a video's ENTIRE soundtrack with narration (+ optional ducked music).

    Used by /revoice, /reassemble and sequence segment voiceovers. Video stream is
    copied untouched. With fit=True (default) the output is trimmed to voice-end +
    tail when the narration is short, and the narration atempo'd (capped) when long.
    """
    vdur = probe(video)["duration"]
    ndur = probe(narration)["duration"]
    if fit:
        tempo, out_t, warning = _fit_narration(vdur, ndur, narration_delay_ms)
        if warning and on_warning:
            on_warning(warning)
    else:
        tempo, out_t = None, vdur
    narr = _narr_filter(narration_delay_ms, gain=narration_gain, tempo=tempo)
    if music:
        fc = (f"{narr};[2:a]volume={music_gain}[bg];"
              f"[narr][bg]amix=inputs=2:duration=first[mix]")
        cmd = ["ffmpeg", "-y", "-i", video, "-i", narration, "-i", music,
               "-filter_complex", fc,
               "-map", "0:v", "-map", "[mix]", "-c:v", "copy", "-c:a", "aac",
               "-t", f"{out_t:.3f}", out]
    else:
        cmd = ["ffmpeg", "-y", "-i", video, "-i", narration,
               "-filter_complex", narr,
               "-map", "0:v", "-map", "[narr]", "-c:v", "copy", "-c:a", "aac",
               "-t", f"{out_t:.3f}", out]
    _run(cmd)
    return out


def concat_reencode(clips: list[str], out: str = "sequence.mp4") -> str:
    """Concat clips from MIXED workflows (sequence mode: t2v + i2v + S2V segments).

    Re-encodes video (mixed sources rarely share exact encoder params) and guarantees
    every segment contributes an audio track — silent clips get anullsrc for their
    duration so the concat filter's audio lane never breaks. All clips must share
    resolution and fps (sequence mode renders every segment at the job's WxH @16fps).
    """
    if not clips:
        raise ValueError("concat_reencode() needs at least one clip.")
    probed = [probe(c) for c in clips]

    # First clip is canon: every lane is scaled/padded/retimed to it, so a 9:16 raw
    # clip, a 1:1 clip and a 32fps enhanced file can share one timeline.
    canon_w = probed[0]["width"] or 640
    canon_h = probed[0]["height"] or 640
    canon_fps = probed[0]["fps"] or 16.0

    cmd: list[str] = ["ffmpeg", "-y"]
    for c in clips:
        cmd += ["-i", c]
    # Silent clips borrow audio from anullsrc inputs appended after the real ones.
    null_index: dict[int, int] = {}
    n_inputs = len(clips)
    for i, p in enumerate(probed):
        if not p["has_audio"]:
            cmd += ["-f", "lavfi", "-t", f"{max(p['duration'], 0.1):.3f}",
                    "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]
            null_index[i] = n_inputs
            n_inputs += 1

    parts: list[str] = []
    lanes: list[str] = []
    for i in range(len(clips)):
        parts.append(
            f"[{i}:v]scale={canon_w}:{canon_h}:force_original_aspect_ratio=decrease,"
            f"pad={canon_w}:{canon_h}:(ow-iw)/2:(oh-ih)/2,fps={canon_fps:g},setsar=1[v{i}]"
        )
        a_src = f"[{null_index[i]}:a]" if i in null_index else f"[{i}:a]"
        parts.append(f"{a_src}aresample=44100,aformat=channel_layouts=stereo[a{i}]")
        lanes += [f"[v{i}]", f"[a{i}]"]
    fc = ";".join(parts) + f";{''.join(lanes)}concat=n={len(clips)}:v=1:a=1[v][a]"

    cmd += ["-filter_complex", fc, "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-crf", "18", "-preset", "veryfast",
            "-pix_fmt", "yuv420p", "-c:a", "aac", out]
    _run(cmd)
    return out


def stitch_plus_music(
    clips: list[str],
    music: str | None = None,
    out: str = "final.mp4",
) -> str:
    """Stitch clips whose video ALREADY has audio (S2V/MultiTalk/LTX); optionally mix a music bed."""
    stitched = stitch(clips, out=_stitched_path(out))
    if not music:
        return stitched
    try:
        fc = (f"[0:a]volume=1.0[v];[1:a]volume={MUSIC_DUCK_VOLUME}[bg];"
              f"[v][bg]amix=inputs=2:duration=first[mix]")
        cmd = ["ffmpeg", "-y", "-i", stitched, "-i", music,
               "-filter_complex", fc,
               "-map", "0:v", "-map", "[mix]", "-c:v", "copy", "-c:a", "aac",
               "-shortest", out]
        _run(cmd)
    finally:
        Path(stitched).unlink(missing_ok=True)  # never leak the intermediate, even on failure
    return out


END_CARD_BG = "0x0f0f11"       # the app's dark canvas
END_CARD_ACCENT = "0xff4d3d"   # coral accent (offer line)

_FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",  # EN + Devanagari glyphs
    "/System/Library/Fonts/Helvetica.ttc",
]


def _font() -> str:
    for f in _FONT_CANDIDATES:
        if Path(f).exists():
            return f
    raise RuntimeError("no usable font found for end-card drawtext")


def end_card(
    video: str,
    brand: str,
    tagline: str | None = None,
    offer: str | None = None,
    seconds: float = 2.5,
    out: str = "carded.mp4",
) -> str:
    """Append a branded end card (brand / tagline / offer) to a video.

    Video models garble on-screen text, so prompts ban it — the card is where the
    brand name, tagline and offer belong (docs' text-overlay chunk). The card
    matches the video's size/fps and fades in; concat_reencode() supplies the
    silent audio lane so soundtracks survive untouched.
    Text goes through drawtext textfile= (no escaping minefield; Devanagari OK).
    """
    info = probe(video)
    w, h = info["width"] or 720, info["height"] or 1280
    fps = info["fps"] or 16.0
    font = _font()

    # (text, fontsize, color, y-fraction) — brand dominates, offer pops in coral.
    rows = [(brand.strip(), h // 10, "white", 0.42)]
    if tagline and tagline.strip():
        rows.append((tagline.strip(), h // 24, "0xb9b9c0", 0.56))
    if offer and offer.strip():
        rows.append((offer.strip(), h // 18, END_CARD_ACCENT, 0.68))

    tmp_files: list[str] = []
    draws: list[str] = []
    try:
        for text, size, color, yfrac in rows:
            tf = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False,
                                             encoding="utf-8")
            tf.write(text)
            tf.close()
            tmp_files.append(tf.name)
            draws.append(
                f"drawtext=fontfile='{font}':textfile='{tf.name}'"
                f":fontcolor={color}:fontsize={int(size)}"
                f":x=(w-text_w)/2:y={yfrac:.2f}*h"
            )
        vf = ",".join(draws) + ",fade=t=in:st=0:d=0.35"
        card = _stitched_path(out).replace(".stitched.", ".card.")
        _run(["ffmpeg", "-y", "-f", "lavfi",
              "-i", f"color=c={END_CARD_BG}:s={w}x{h}:d={seconds:.2f}:r={fps:.3f}",
              "-vf", vf, "-c:v", "libx264", "-pix_fmt", "yuv420p", card])
        try:
            return concat_reencode([video, card], out=out)
        finally:
            Path(card).unlink(missing_ok=True)
    finally:
        for t in tmp_files:
            Path(t).unlink(missing_ok=True)


def stitch_music_only(
    clips: list[str],
    music: str,
    out: str = "final.mp4",
) -> str:
    """Stitch SILENT clips (t2v/i2v) and lay a music bed as the only soundtrack.

    The no-narration + music case: amix would fail (silent clips have no audio
    stream), so the music is mapped directly at full volume and cut at video end."""
    stitched = stitch(clips, out=_stitched_path(out))
    try:
        vdur = probe(stitched)["duration"]
        cmd = ["ffmpeg", "-y", "-i", stitched, "-i", music,
               "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac",
               "-t", f"{vdur:.3f}", out]
        _run(cmd)
    finally:
        Path(stitched).unlink(missing_ok=True)
    return out
