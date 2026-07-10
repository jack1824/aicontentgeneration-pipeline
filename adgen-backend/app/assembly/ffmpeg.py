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
# The trim is CAPPED so a fit can't gut an ad's visuals — but the cap is generous
# (client feedback 2026-07-07: silent tails read as bugs, so dead air loses to
# shorter cuts by default; tails past the cap stay in and get flagged in the
# sync report instead).
FIT_TAIL_S = 0.45
FIT_MAX_TEMPO = 1.12
FIT_MAX_TRIM_S = 4.0


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
    """Narration filter chain: delay FIRST, then tempo.

    atempo BEFORE adelay produced a SILENT narration lane under amix (ffmpeg
    timestamp quirk — bisected 2026-07-07: the sa01 render had ambience but no
    voice whenever tempo-fitting kicked in). Delay is pre-scaled by the tempo so
    the effective start offset stays what the caller asked for.
    """
    parts = []
    # Soft 120ms entry on the raw narration BEFORE any delay/tempo — the VO no
    # longer pops in abruptly after the silent lead-in (client: "no voice" frames).
    parts.append("afade=t=in:st=0:d=0.12")
    eff_delay = delay_ms
    has_tempo = bool(tempo and tempo > 1.001)
    if has_tempo:
        eff_delay = int(round(delay_ms * min(tempo, 2.0)))
    parts.append(f"adelay={eff_delay}|{eff_delay}")
    if has_tempo:
        parts.append(f"atempo={min(tempo, 2.0):.4f}")
    if abs(gain - 1.0) > 1e-6:
        parts.append(f"volume={gain}")
    parts.append("apad")
    return "[1:a]" + ",".join(parts) + "[narr]"


def silence_map(path: str, noise_db: int = -45, min_s: float = 0.3) -> dict:
    """Every silent stretch in a file's audio, via silencedetect.

    Returns {"duration": s, "silences": [{"start", "end"}, ...]} in order; an
    unclosed trailing interval is closed at the file's end. A file with no audio
    stream at all reports one interval covering its whole duration.
    """
    info = probe(path)
    dur = info["duration"]
    if not info["has_audio"]:
        return {"duration": dur, "silences": [{"start": 0.0, "end": dur}]}
    proc = subprocess.run(
        ["ffmpeg", "-i", path, "-af",
         f"silencedetect=noise={noise_db}dB:d={min_s}", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    starts = [float(x) for x in re.findall(r"silence_start: (-?[0-9.]+)", proc.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: (-?[0-9.]+)", proc.stderr)]
    silences = []
    for i, s in enumerate(starts):
        e = ends[i] if i < len(ends) else dur  # unclosed run -> EOF
        silences.append({"start": max(0.0, s), "end": min(max(0.0, e), dur)})
    # An audio STREAM that simply ENDS before the video (S2V take with a short
    # script) has no silent samples for silencedetect to find — treat the
    # missing span as silence (protein-ad postmortem).
    try:
        sproc = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a:0",
             "-show_entries", "stream=duration", "-of", "json", path],
            capture_output=True, text=True,
        )
        adur = float(json.loads(sproc.stdout)["streams"][0].get("duration") or dur)
    except (KeyError, IndexError, ValueError, json.JSONDecodeError):
        adur = dur
    if adur < dur - 0.25:
        if silences and silences[-1]["end"] >= adur - 0.05:
            silences[-1]["end"] = dur  # extend a trailing run to true EOF
        else:
            silences.append({"start": adur, "end": dur})
    return {"duration": dur, "silences": silences}


def detect_audio_end(path: str) -> float:
    """Last audible moment in a file: trailing-silence start via silence_map,
    falling back to the full duration when there is no trailing silence."""
    m = silence_map(path)
    if m["silences"]:
        last = m["silences"][-1]
        # Trailing silence = the last interval runs to (within 0.25s of) EOF.
        if last["end"] >= m["duration"] - 0.25:
            return last["start"]
    return m["duration"]


def sync_report(path: str, gap_min_s: float = 0.8) -> dict:
    """Where the sound lives — the client-facing 'why is this part quiet' answer.

    lead_in: silence before the first sound; tail: silence after the last sound;
    gaps: mid-video silences >= gap_min_s. voice_start/voice_end bound the audible
    span. `silent` flags a file with no audible audio at all.
    """
    m = silence_map(path)
    dur, sil = m["duration"], m["silences"]
    lead_in = tail = 0.0
    gaps = []
    for iv in sil:
        s, e = iv["start"], iv["end"]
        if s <= 0.05:
            lead_in = e
        if e >= dur - 0.25 and s > 0.05:
            tail = dur - s
        elif s > 0.05 and e < dur - 0.25 and e - s >= gap_min_s:
            gaps.append({"start": round(s, 2), "end": round(e, 2), "len": round(e - s, 2)})
    silent = bool(sil) and lead_in >= dur - 0.25
    return {
        "duration": round(dur, 2),
        "voice_start": round(lead_in, 2),
        "voice_end": round(dur - tail, 2),
        "lead_in": round(lead_in, 2),
        "tail": round(tail, 2),
        "gaps": gaps,
        "silent": silent,
    }


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


def dialogue_tracks(turn_paths: list[str], speakers: list[int], out_a: str,
                    out_b: str, out_mix: str, gap_s: float = 0.3) -> tuple[str, str, str, float]:
    """Build the multi-stream timeline for a duo take: per-speaker tracks where
    each speaker is SILENT during the other's turns (LongCat drives each mouth
    from its own stream), plus the combined conversation for the final mux.
    Returns (track_a, track_b, mix, total_seconds)."""
    durs = [probe(p)["duration"] for p in turn_paths]

    def build(track_speaker: int | None, out: str) -> None:
        # mix (track_speaker None) = every turn audible; per-speaker = own turns
        # audible, silence elsewhere. A short gap after each turn keeps pacing.
        n = len(turn_paths)
        inputs: list[str] = []
        for p in turn_paths:
            inputs += ["-i", p]
        parts, filters = [], []
        for i, (spk, d) in enumerate(zip(speakers, durs)):
            if track_speaker is None or spk == track_speaker:
                filters.append(f"[{i}:a]aresample=44100,aformat=channel_layouts=mono[t{i}]")
            else:
                filters.append(
                    f"anullsrc=r=44100:cl=mono,atrim=duration={d:.3f}[t{i}]")
            parts.append(f"[t{i}]")
            filters.append(f"anullsrc=r=44100:cl=mono,atrim=duration={gap_s:.3f}[g{i}]")
            parts.append(f"[g{i}]")
        filters.append("".join(parts) + f"concat=n={2 * n}:v=0:a=1[out]")
        _run(["ffmpeg", "-y", *inputs, "-filter_complex", ";".join(filters),
              "-map", "[out]", out])

    build(0, out_a)
    build(1, out_b)
    build(None, out_mix)
    total = sum(durs) + gap_s * len(durs)
    return out_a, out_b, out_mix, total


def fit_audio_duration(audio: str, seconds: float, out: str) -> str:
    """Pad-with-silence or trim an audio file to EXACTLY `seconds` (redub tracks
    must match the source video's length so lip timing stays aligned)."""
    _run(["ffmpeg", "-y", "-i", audio, "-af",
          f"apad=whole_dur={seconds:.3f},atrim=duration={seconds:.3f}", out])
    return out


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
                  f"[narr][bg]amix=inputs=2:duration=first:normalize=0[mix]")
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
              f"[narr][bg]amix=inputs=2:duration=first:normalize=0[mix]")
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
    """Concat clips from MIXED workflows (sequence mode: t2v + i2v + S2V + LTX segments).

    Re-encodes video (mixed sources rarely share exact encoder params) and guarantees
    every segment contributes an audio track — silent clips get anullsrc for their
    duration so the concat filter's audio lane never breaks.

    CONFORM PASS (Phase 2 of the 2026-07-09 quality audit):
      - canon fps = the FASTEST lane (was: first clip), so a 25fps LTX timeline
        can never down-throttle and a 16fps-first ordering can't dup-frame the rest;
      - lanes slower than canon get MOTION-COMPENSATED retiming (minterpolate),
        not dup frames — the audit measured 35-48% duplicated frames on every
        Wan span inside mixed sequences (a visible 2-1-2 stutter), 0% on gold.
        Verified on the protein ad: moving Wan span 35.3% dups -> 2.0%.
    NOT here (tried and reverted 2026-07-09): per-lane brightness/saturation
    matching toward the lane median — cross-scene stats can't tell engine color
    cast from intentional lighting (it tried to brighten a moody hook toward a
    bright product macro). Engine-tone unification belongs to the Phase-3
    finishing pass, keyed by ENGINE, not by scene statistics.
    """
    if not clips:
        raise ValueError("concat_reencode() needs at least one clip.")
    probed = [probe(c) for c in clips]

    # First clip is canon for GEOMETRY only (scale/pad keeps any aspect working).
    canon_w = probed[0]["width"] or 640
    canon_h = probed[0]["height"] or 640
    # Canon fps = fastest NATIVE lane, capped at 30: a remixed 32/50fps -post
    # file must not drag every raw lane through minterpolate (CPU-minutes) —
    # its RIFE-invented frames decimate harmlessly instead (review finding).
    fps_vals = [(p["fps"] or 16.0) for p in probed]
    native = [f for f in fps_vals if f <= 30.5]
    canon_fps = max(native) if native else 25.0

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
        lane_fps = probed[i]["fps"] or 16.0
        if lane_fps < canon_fps - 0.5:
            # Motion-compensated 16->25 (etc.): real in-between frames instead of
            # the dup-frame pulldown the plain fps filter produces.
            retime = (f"minterpolate=fps={canon_fps:g}:mi_mode=mci:mc_mode=aobmc:"
                      f"me_mode=bidir:vsbmc=1")
        else:
            retime = f"fps={canon_fps:g}"
        parts.append(
            f"[{i}:v]scale={canon_w}:{canon_h}:force_original_aspect_ratio=decrease,"
            f"pad={canon_w}:{canon_h}:(ow-iw)/2:(oh-ih)/2,{retime},setsar=1[v{i}]"
        )
        a_src = f"[{null_index[i]}:a]" if i in null_index else f"[{i}:a]"
        # Pin every audio lane to its clip's VIDEO duration: concat joins the
        # lanes independently, so an audio stream that runs short (LTX files
        # are often ~1s shy) slides every later clip's sound early and leaves
        # a silent hole before each cut (found via the end-card fade test).
        d = max(probed[i]["duration"], 0.1)
        parts.append(
            f"{a_src}aresample=44100,aformat=channel_layouts=stereo,"
            f"apad=whole_dur={d:.3f},atrim=duration={d:.3f}[a{i}]"
        )
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
              f"[v][bg]amix=inputs=2:duration=first:normalize=0[mix]")
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


def burn_captions(video: str, captions: list[dict], out: str = "captioned.mp4") -> str:
    """Burn timed caption/super overlays into a video (the muted-viewer layer).

    captions: [{start, end, text, position?: "top"|"bottom"|"center", accent?: bool}]
    Brand, claims and CTA live in REAL overlay pixels — never generated ones
    (ad-agent panel, 2026-07-11: 70%+ of Reels play muted; VO-only branding
    scores 2/10). Text rides drawtext textfile= (Devanagari-safe); positions
    sit inside 9:16 safe zones (clear of platform UI at top/bottom edges).
    Keep lines short — drawtext does not wrap (use \\n for manual breaks)."""
    if not captions:
        return video
    info = probe(video)
    h = info["height"] or 1280
    w = info["width"] or 720
    font = _font()
    # drawtext has no wrapping: fold long lines to fit the frame width. The
    # per-char width heuristic (~0.55 x fontsize) holds for Latin+Devanagari
    # in Arial Unicode at these sizes.
    max_chars = max(12, int(w / ((h // 20) * 0.55)))
    tmp_files: list[str] = []
    draws: list[str] = []
    try:
        for c in captions:
            words, lines, cur = str(c["text"]).strip().split(), [], ""
            for word in words:
                if cur and len(cur) + 1 + len(word) > max_chars:
                    lines.append(cur)
                    cur = word
                else:
                    cur = f"{cur} {word}".strip()
            if cur:
                lines.append(cur)
            tf = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False,
                                             encoding="utf-8")
            tf.write("\n".join(lines))
            tf.close()
            tmp_files.append(tf.name)
            pos = c.get("position", "bottom")
            y = {"top": "0.10*h", "center": "(h-text_h)/2"}.get(pos, "0.80*h-text_h")
            color = END_CARD_ACCENT if c.get("accent") else "white"
            draws.append(
                f"drawtext=fontfile='{font}':textfile='{tf.name}'"
                f":enable='between(t,{float(c['start']):.2f},{float(c['end']):.2f})'"
                f":fontcolor={color}:fontsize={h // 20}"
                f":box=1:boxcolor=black@0.45:boxborderw={h // 90}"
                f":x=(w-text_w)/2:y={y}:line_spacing={h // 90}"
            )
        _run(["ffmpeg", "-y", "-i", video, "-vf", ",".join(draws),
              "-c:v", "libx264", "-crf", "18", "-preset", "veryfast",
              "-pix_fmt", "yuv420p", "-c:a", "copy", out])
        return out
    finally:
        for t in tmp_files:
            Path(t).unlink(missing_ok=True)


def end_card(
    video: str,
    brand: str,
    tagline: str | None = None,
    offer: str | None = None,
    seconds: float = 2.5,
    out: str = "carded.mp4",
    product_image: str | None = None,
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

    # Text must FIT the frame: drawtext neither wraps nor shrinks, so cap each
    # row's fontsize by the line length (~0.55 x fontsize per char heuristic).
    def _fit(size: int, text: str) -> int:
        return max(h // 40, min(size, int(w * 0.94 / (max(len(text), 1) * 0.55))))

    # With a REAL product photo on the card (ad-agent panel fix: the closing
    # pack shot must be actual pixels — generated labels garble), the photo
    # owns the upper half and the text rows shift down to make room.
    if product_image:
        rows = [(brand.strip(), _fit(h // 12, brand), "white", 0.62)]
        if tagline and tagline.strip():
            rows.append((tagline.strip(), _fit(h // 26, tagline), "0xb9b9c0", 0.72))
        if offer and offer.strip():
            rows.append((offer.strip(), _fit(h // 18, offer), END_CARD_ACCENT, 0.80))
    else:
        # (text, fontsize, color, y-fraction) — brand dominates, offer pops in coral.
        rows = [(brand.strip(), _fit(h // 10, brand), "white", 0.42)]
        if tagline and tagline.strip():
            rows.append((tagline.strip(), _fit(h // 24, tagline), "0xb9b9c0", 0.56))
        if offer and offer.strip():
            rows.append((offer.strip(), _fit(h // 18, offer), END_CARD_ACCENT, 0.68))

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
        card = _stitched_path(out).replace(".stitched.", ".card.")
        if product_image:
            fc = (f"[1:v]scale={int(w * 0.55)}:-1[img];"
                  f"[0:v][img]overlay=(W-w)/2:{int(h * 0.10)}[bg];"
                  f"[bg]{','.join(draws)},fade=t=in:st=0:d=0.35[v]")
            _run(["ffmpeg", "-y", "-f", "lavfi",
                  "-i", f"color=c={END_CARD_BG}:s={w}x{h}:d={seconds:.2f}:r={fps:.3f}",
                  "-i", product_image, "-filter_complex", fc, "-map", "[v]",
                  "-c:v", "libx264", "-pix_fmt", "yuv420p", card])
        else:
            vf = ",".join(draws) + ",fade=t=in:st=0:d=0.35"
            _run(["ffmpeg", "-y", "-f", "lavfi",
                  "-i", f"color=c={END_CARD_BG}:s={w}x{h}:d={seconds:.2f}:r={fps:.3f}",
                  "-vf", vf, "-c:v", "libx264", "-pix_fmt", "yuv420p", card])
        joined = _stitched_path(out).replace(".stitched.", ".joined-card.")
        try:
            concat_reencode([video, card], out=joined)
            # The card's lane is pure silence — without a fade the soundtrack
            # stops DEAD at the cut (client: "no voice" frames). The fade is
            # anchored to END exactly at the last audible moment (review catch:
            # a fixed vdur-0.7 fade ate the final spoken word when speech ran
            # right up to the cut) — it only shapes the natural decay, never
            # earlier content, and a video with a silent tail gets the same
            # gentle landing at its own last sound.
            audio_end = detect_audio_end(video) if info["has_audio"] else 0.0
            fade_d = 0.35
            fade_st = max(0.0, audio_end - fade_d)
            _run(["ffmpeg", "-y", "-i", joined,
                  "-af", f"afade=t=out:st={fade_st:.3f}:d={fade_d:.2f}",
                  "-c:v", "copy", "-c:a", "aac", out])
            return out
        finally:
            Path(card).unlink(missing_ok=True)
            Path(joined).unlink(missing_ok=True)
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
