"""Shot QC gate (Phase 1 of the render-quality plan, 2026-07-09 audit).

Every clip is reviewed BEFORE assembly: cheap local checks first (freeze scan +
blur), then one Gemini vision pass with an ad-agency rubric (sharpness, anatomy,
props, brand legibility, exposure). A failing clip re-rolls with a fresh seed up
to QC_MAX_TAKES total takes and the best-scoring take ships — selection, not
luck. Motivation: the audit measured per-shot sharpness swinging 8-10x inside
one ad while the client-loved farmer reference swings 3.7x; the variance IS the
perceived quality gap. Vision is best-effort: if Gemini is down the gate
degrades to the local checks instead of blocking renders.
"""
import base64
import json
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path

import httpx

from app.config import GEMINI_API_KEY

# Total takes per shot including the first (2 re-rolls). Re-rolls are minutes of
# GPU each — the gate spends them only on defects a client would reject.
# Clamped to >=1: 1 means "review + warn, never re-roll".
QC_MAX_TAKES = max(1, int(os.getenv("QC_MAX_TAKES", "3")))

# QC can run on its own key/quota so per-take vision calls never starve the
# planner (same Gemini free-tier pools). Falls back to the shared key.
QC_GEMINI_API_KEY = os.getenv("QC_GEMINI_API_KEY") or GEMINI_API_KEY

# Second judge: NVIDIA NIM vision. Model ids here ROT FAST — the previous two both
# went 410 Gone within weeks (qwen3.5-397b, then nemotron-nano-vl-8b hours after it
# was wired in). The admin dashboard's provider probe exists to catch exactly that;
# when it flags this rung dead, swap the id via QC_NVIDIA_MODEL rather than deploying.
# NOTE: NVIDIA vision NIMs accept ONE image per prompt — see vision_review.
NVIDIA_API_KEY = (os.getenv("NVIDIA_API_KEY") or "").strip().strip("\"'“”")
if NVIDIA_API_KEY and not NVIDIA_API_KEY.startswith("nvapi-"):
    NVIDIA_API_KEY = ""  # non-NVIDIA paste — ignore it
# Vision-capable and CURRENT — see the note in llm.py: the previous ids were dead,
# which is why a Gemini 429 produced "vision QC unavailable" instead of degrading
# to another vendor as designed.
_NVIDIA_MODEL = os.getenv("QC_NVIDIA_MODEL", "meta/llama-3.2-11b-vision-instruct")
_NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

# Third judge: Groq-hosted Qwen vision (OpenAI-compatible API, separate vendor =
# truly independent quota). The gate must never go blind just because one or two
# vendors throttle us. There is no Llama-4 vision model on this account despite
# what these comments used to claim — qwen3.8 is the ONLY vision-capable id Groq
# exposes here; every other chat model rejects image_url parts with a 400.
# The id carries a MINOR version: 3.6 was retired and 404'd silently for weeks,
# which is how the last rung died. When the dashboard probe flags it, bump the
# minor version via QC_GROQ_MODEL first — it is usually a rename, not an outage.
GROQ_API_KEY = (os.getenv("GROQ_API_KEY") or "").strip().strip("\"'“”")
if GROQ_API_KEY and not GROQ_API_KEY.startswith("gsk_"):
    GROQ_API_KEY = ""  # a non-Groq paste (e.g. an AIza Google key) — ignore it
_GROQ_MODEL = os.getenv("QC_GROQ_MODEL", "qwen/qwen3.8-27b")
_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
# A freeze under this long can be a deliberate hold; over it reads as a glitch
# (the dentist audit found a 1.2s dead-frame span a viewer reads as buffering).
FREEZE_FAIL_S = 0.8

# Gemini's free tier meters ~20 requests/day PER MODEL per project, so QC and the
# PLANNER must not share a model or they starve each other: a 6-segment render spends
# one vision call per take (three on a re-roll) and had already drained the planner's
# budget by segment 2 — which is what "vision QC unavailable (Gemini)" meant, and why
# planning went flaky on the same day. Pointing QC at its own model buys a separate
# bucket. Keep this DIFFERENT from llm.GEMINI_MODEL / llm.GEMINI_FALLBACK_MODEL.
_VISION_MODEL = os.getenv("QC_VISION_MODEL", "gemini-3.5-flash")
_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

_RUBRIC = """\
You are a merciless ad-agency QC reviewer. The images are frames sampled in order
from ONE short AI-generated ad shot. Judge whether this take can ship.

Shot brief (what it is supposed to show):
{context}

Return STRICT JSON only:
{{"sharpness": <1-5>, "anatomy_ok": <bool>, "props_ok": <bool>,
  "matches_brief": <bool>, "brand_legible": "yes"|"no"|"n/a", "exposure_ok": <bool>,
  "product_ok": "yes"|"no"|"n/a",
  "has_face": <bool>, "has_brand_text": <bool>, "issue": "<short phrase, empty if clean>"}}

- sharpness: 5 crisp, 3 acceptable at social-feed size, 1 unusably soft.
- anatomy_ok=false for malformed/extra fingers, warped faces, dead or misaligned
  eyes, impossible limbs, waxy doll-like skin.
- props_ok=false ONLY for visual glitches: objects morphing/floating/duplicated,
  a held object swapping hands between frames, physically impossible props.
  It is NOT about whether the props match the brief.
- matches_brief=false ONLY when the CENTRAL subject of the brief (the product,
  the person, the core setting) is absent or replaced by something else. NEVER
  fail it for minor attribute differences — crop species, colors, background
  details, exact framing. Creative liberty is fine; a missing hero product or
  missing person is not.
- brand_legible="no" ONLY if brand/label text is visible but garbled, misspelled,
  or imitating a different real brand; "n/a" when no brand text is visible.
- exposure_ok=false only for SUSTAINED under/over-exposure that hides the
  subject; a single stylistic flash/transition frame is fine.
- product_ok="no" ONLY when the brief requires a specific REAL product in frame
  (held / poured / drunk / applied) and it is absent, duplicated, morphing
  between frames, or its label/shape is warped. "n/a" when the brief has no
  such product-contact requirement.
- These are compressed thumbnails: JPEG artifacts are NOT defects; judge content."""


def _ffmpeg_stderr(args: list[str]) -> str:
    r = subprocess.run(["ffmpeg", "-hide_banner", *args, "-f", "null", "-"],
                       capture_output=True, text=True)
    return r.stderr


def _duration(path: str) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", path], capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def _ydif_series(path: str) -> tuple[list[float], float]:
    """Per-frame motion (signalstats YDIF = mean |luma delta| vs previous frame)
    and the clip's fps, in one ffprobe pass."""
    esc = path.replace("\\", "/").replace("'", "").replace(":", r"\:")
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-f", "lavfi",
         "-i", f"movie='{esc}',signalstats",
         "-show_entries", "frame_tags=lavfi.signalstats.YDIF",
         "-of", "csv=p=0"], capture_output=True, text=True)
    vals = []
    for tok in r.stdout.split():
        try:
            vals.append(float(tok.strip().rstrip(",")))
        except ValueError:
            continue
    fr = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=avg_frame_rate", "-of", "csv=p=0", path],
        capture_output=True, text=True)
    try:
        num, den = fr.stdout.strip().rstrip(",").split("/")
        fps = float(num) / float(den)
    except (ValueError, ZeroDivisionError):
        fps = 16.0
    return vals[1:], (fps if fps > 1 else 16.0)  # frame 0 has no predecessor


def freeze_scan(path: str) -> float:
    """Longest truly-still span (seconds), judged RELATIVE to the clip's own motion.

    A glitch freeze is a clip that MOVES and then locks; an intentionally slow
    shot (honey macro, product pedestal) is uniformly low-motion and must pass.
    So the stillness threshold is 0.6x the clip's median per-frame motion
    (floored at 0.15 gray levels). Calibrated 2026-07-09 on real renders:
    true freeze 1.84s vs 0.31-0.69s for slow-motion/talking-head/clean clips —
    absolute-threshold detectors (freezedetect) could not separate these.
    A clip whose MEDIAN motion is ~zero never moves at all — returned whole."""
    v, fps = _ydif_series(path)
    if not v:
        return 0.0
    med = sorted(v)[len(v) // 2]
    if med < 0.15:
        return round(len(v) / fps, 2)  # the clip never moves — that's the defect
    th = max(0.15, 0.6 * med)
    best = cur = 0
    for x in v:
        cur = cur + 1 if x < th else 0
        best = max(best, cur)
    return round(best / fps, 2)


def blur_mean(path: str) -> float | None:
    """blurdetect average for the whole clip (HIGHER = blurrier). Only comparable
    between takes of the SAME shot — content changes the scale."""
    err = _ffmpeg_stderr(["-i", path, "-an", "-vf", "blurdetect=block_pct=80"])
    m = re.search(r"blur mean: ([0-9.]+)", err)
    return float(m.group(1)) if m else None


# A take with more of its frame than this clipped to pure white reads as HAZY —
# a blown-out window or doorway behind the subject, washing the picture. Set from
# measurement: a clean lamp-lit take reads 0.1%, an approved reference 0.4%, while
# the shots a client twice called "very hazy" read 14-19%.
BLOWN_FAIL_PCT = 8.0

# The opposite failure, and one we shipped repeatedly while fixing the first.
# Chasing blown highlights produced lamp-lit sets on dark wood that measured YAVG
# 47 against 106 on the approved reference — the client's words were "why is every
# video so dark". A gate on only one end of the exposure range just moves the
# defect, so both ends are checked.
DARK_FAIL_YAVG = 60.0


def mean_luma(path: str) -> float | None:
    """Average frame brightness, 0-255. The approved reference sits at ~106."""
    err = _ffmpeg_stderr(["-i", path, "-an", "-vf",
                          "signalstats,metadata=print:key=lavfi.signalstats.YAVG"])
    vals = [float(v) for v in re.findall(r"YAVG=([0-9.]+)", err)]
    return sum(vals) / len(vals) if vals else None


def blown_pct(path: str, samples: int = 5) -> float | None:
    """Percent of frame area clipped to near-white, averaged over the take.

    This exists because the metric we USED to judge haze by — luma range — is
    actively wrong for it. A blown window puts pixels at both 0 and 255, so range
    reads HIGH: the two haziest shots in a 30s ad scored 212.9, the best numbers in
    the film, while a fifth of each frame was pure white. Range measures contrast,
    not clipping, and haze is clipping.

    Uses ffmpeg's histogram rather than a Python pixel loop so it stays cheap
    enough to run on every take."""
    dur = _duration(path)
    if dur <= 0:
        return None
    vals: list[float] = []
    for frac in [(i + 0.5) / samples for i in range(samples)]:
        err = _ffmpeg_stderr([
            "-ss", f"{dur * frac:.2f}", "-i", path, "-frames:v", "1", "-an",
            # Isolate pixels at/above 245 and read what fraction of the frame they are.
            "-vf", "format=gray,geq=lum='if(gte(p(X,Y),245),255,0)',signalstats,"
                   "metadata=print:key=lavfi.signalstats.YAVG",
        ])
        m = re.findall(r"YAVG=([0-9.]+)", err)
        if m:
            # YAVG of a 0/255 mask is 255 * (fraction blown).
            vals.append(float(m[-1]) / 255.0 * 100.0)
    return sum(vals) / len(vals) if vals else None


def _frames_b64(path: str, n: int = 3, width: int = 768, q: int = 4) -> list[str]:
    """n frames sampled across the take, base64 JPEG. `width`/`q` exist because the
    rungs do NOT share a payload budget: Groq 413s on three 768px frames that Gemini
    and NVIDIA accept happily, so that rung re-samples smaller rather than going blind."""
    dur = _duration(path)
    if dur <= 0:
        raise RuntimeError(f"unreadable clip: {path}")
    out = []
    with tempfile.TemporaryDirectory() as tmp:
        for frac in (0.15, 0.5, 0.85)[:n]:
            f = Path(tmp) / f"{frac}.jpg"
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-ss", f"{dur * frac:.2f}",
                 "-i", path, "-frames:v", "1", "-vf", f"scale={width}:-2", "-q:v", str(q),
                 str(f)], check=True)
            out.append(base64.b64encode(f.read_bytes()).decode())
    return out


def _tristate(v, default: str = "n/a") -> str:
    """yes/no/n-a fields: sloppy judges emit JSON booleans — str(False).lower()
    is 'false' != 'no', which would let the defect pass. Map bools explicitly."""
    if isinstance(v, bool):
        return "yes" if v else "no"
    return str(v if v is not None else default).lower()


def _normalize_verdict(v: dict) -> dict:
    return {
        "sharpness": int(v.get("sharpness", 3)),
        "anatomy_ok": bool(v.get("anatomy_ok", True)),
        "props_ok": bool(v.get("props_ok", True)),
        "matches_brief": bool(v.get("matches_brief", True)),
        "brand_legible": _tristate(v.get("brand_legible", "n/a")),
        "product_ok": _tristate(v.get("product_ok", "n/a")),
        "exposure_ok": bool(v.get("exposure_ok", True)),
        "has_face": bool(v.get("has_face", False)),
        "has_brand_text": bool(v.get("has_brand_text", False)),
        "issue": str(v.get("issue", ""))[:200],
    }


def _openai_style_review(url: str, key: str, model: str, judge: str,
                         frames: list[str], context: str,
                         json_mode: bool, timeout: float = 60,
                         attempts: int = 1,
                         notes: list[str] | None = None) -> dict | None:
    """One rubric review over an OpenAI-compatible vision endpoint (Groq, NVIDIA
    NIM). json_mode toggles response_format — NIM support varies per model, so
    the NVIDIA rung instructs JSON and parses defensively instead.

    `attempts` retries ONLY the prose failure: some vision models accept
    response_format={"type":"json_object"} with a 200 and then narrate the frames
    anyway ("The image shows a man sitting at a table..."). Measured on
    llama-3.2-11b-vision: ~60% JSON per call, so one attempt silently dropped 40%
    of a live judge's verdicts. Retrying a 200-but-unparseable response takes that
    to ~94% at three attempts. An HTTP error is NOT retried here — a 404 (dead
    model id) or 401 never becomes valid by asking twice, and the render thread
    is blocked while we ask.

    `notes` collects a one-line reason per rung so the caller can say WHICH judge
    failed instead of blaming the first one. It is a caller-owned list, not module
    state, so concurrent renders never cross-contaminate each other's warnings."""
    def _note(msg: str) -> None:
        if notes is not None:
            notes.append(f"{judge}: {msg}")

    if not key:
        _note("no API key configured")
        return None
    body: dict = {
        "model": model,
        "messages": [
            {"role": "system", "content": _RUBRIC.format(context=context[:600] or "(no brief)")},
            {"role": "user", "content": [
                {"type": "text", "text": "Frames from the take, in order:"},
                *({"type": "image_url",
                   "image_url": {"url": f"data:image/jpeg;base64,{b}"}}
                  for b in frames),
            ]},
        ],
    }
    # max_tokens on BOTH paths: a NIM in json_object mode still needs room, and
    # its low default truncated the verdict mid-object so every parse failed.
    body["max_tokens"] = 2048
    # Scoring must be DETERMINISTIC. Left unset, these endpoints default to ~1.0
    # and the same pixels scored sharpness 5, then 3, then 3 on consecutive calls,
    # with brand_legible flipping "yes"/"n/a". review_clip's caller ships the
    # best-scoring take, so a +/-2 swing on identical frames made take selection
    # partly a coin flip — the gate is supposed to be selection, not luck. At 0.1
    # the same clip returns byte-identical verdicts across runs.
    body["temperature"] = 0.1
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    for i in range(max(1, attempts)):
        try:
            r = httpx.post(url, headers={"Authorization": f"Bearer {key}"},
                           json=body, timeout=timeout)
            r.raise_for_status()
            text = r.json()["choices"][0]["message"]["content"].strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0]
            start, end = text.find("{"), text.rfind("}")
            if start >= 0 and end > start:
                out = _normalize_verdict(json.loads(text[start:end + 1]))
                out["judge"] = judge
                return out
            # 200 but no JSON object: the prose failure. Worth another roll.
            if i == attempts - 1:
                _note(f"returned prose instead of JSON on all {attempts} attempts")
        except httpx.HTTPStatusError as e:
            code = e.response.status_code
            # Split permanent from transient. A retired id (404), a bad key (401)
            # or a forbidden model (403) is identical on the next call, so bail and
            # let the ladder move on. But Groq's on-demand tier meters ~8k input
            # tokens/min — roughly three QC calls — and throws 429/503 under load;
            # treating those as permanent blinded the LAST rung for a reason that
            # clears in seconds, which is the same silent-fallthrough class as the
            # NVIDIA prose bug. Backoff stays small: a render thread waits here.
            # 429 is NOT retried here even though it is transient. Groq's on-demand
            # tier meters ~8k input tokens on a ROLLING MINUTE and one 3-frame call
            # is ~2.5k, so a rate-limited rung needs tens of seconds to clear — far
            # longer than a render thread should sit blocked, and a short backoff
            # just burns 4.5s to fail anyway (measured). Let the ladder degrade and
            # say so. 5xx is genuine momentary capacity and does clear in seconds.
            if code not in (500, 502, 503, 504) or i == attempts - 1:
                _note(f"HTTP {code}"
                      + (" — model id retired upstream" if code == 404 else "")
                      + (" — rate limited, ladder degraded to local checks" if code == 429 else ""))
                return None
            time.sleep(1.5 * (i + 1))
        except Exception as e:  # transport, decode, schema
            if i == attempts - 1:
                _note(f"{type(e).__name__}")
    return None


def _nvidia_review(frames: list[str], context: str,
                   notes: list[str] | None = None) -> dict | None:
    """Second judge: NVIDIA NIM vision.

    json_mode=True is REQUIRED here, not optional: without it Llama-3.2-vision
    narrates the frames in prose ("**Frame 1:** the man is sitting...") and the
    rubric JSON never appears, so the rung silently returned None and the ladder
    fell through as if NVIDIA were down. json_mode alone is NOT sufficient either
    — it holds only ~60% of the time on this model — hence attempts=3."""
    return _openai_style_review(_NVIDIA_URL, NVIDIA_API_KEY, _NVIDIA_MODEL,
                                "nvidia", frames, context,
                                json_mode=True, timeout=90,
                                attempts=3, notes=notes)


def _groq_review(frames: list[str], context: str,
                 notes: list[str] | None = None) -> dict | None:
    """Third judge: Groq-hosted vision, same rubric, JSON mode."""
    return _openai_style_review(_GROQ_URL, GROQ_API_KEY, _GROQ_MODEL,
                                "groq", frames, context, json_mode=True,
                                attempts=3, notes=notes)


def vision_review(path: str, context: str,
                  notes: list[str] | None = None) -> dict | None:
    """One rubric-scored vision pass over 3 frames — a three-vendor ladder:
    Gemini -> NVIDIA -> Groq. Returns None only when ALL fail — the gate must
    degrade, never block a render on a judge outage.

    Quota manners: on Gemini 429 we skip down the ladder IMMEDIATELY (no
    sleep-and-retry, no fallback-model hop) — QC runs per take and must never
    drain the planner's quota ladder while a render thread sits blocked.

    `notes` (caller-owned list) collects one line per failed rung. The caller
    surfaces those instead of the old hardcoded "(Gemini)", which blamed the top
    rung for every outage and sent us hunting a Gemini quota problem while the
    real faults were a retired Groq model id and a 40%-prose NVIDIA rung."""
    if not QC_GEMINI_API_KEY and not NVIDIA_API_KEY and not GROQ_API_KEY:
        if notes is not None:
            notes.append("no vision judge is configured (no Gemini/NVIDIA/Groq key)")
        return None
    try:
        frames = _frames_b64(path)
    except Exception as e:
        if notes is not None:
            notes.append(f"clip unreadable for frame sampling ({type(e).__name__})")
        return None  # unreadable clip — no judge can help
    if QC_GEMINI_API_KEY:
        try:
            body = {
                "system_instruction": {"parts": [{"text": _RUBRIC.format(context=context[:600] or "(no brief)")}]},
                "contents": [{"role": "user", "parts": [
                    {"text": "Frames from the take, in order:"},
                    *({"inline_data": {"mime_type": "image/jpeg", "data": b}} for b in frames),
                ]}],
                "generationConfig": {"temperature": 0.1, "response_mime_type": "application/json"},
            }
            r = None
            for i in range(3):
                try:
                    r = httpx.post(_URL.format(model=_VISION_MODEL),
                                   headers={"x-goog-api-key": QC_GEMINI_API_KEY},
                                   json=body, timeout=90)
                    r.raise_for_status()
                    break
                except httpx.HTTPStatusError as e:
                    r = None
                    code = e.response.status_code
                    if i == 2 or code not in (500, 503):
                        if notes is not None:
                            notes.append(
                                f"gemini: HTTP {code}"
                                + (" — daily free-tier quota exhausted" if code == 429 else ""))
                        break  # 429/4xx: fall through to the NVIDIA judge now
                    time.sleep(2 * (i + 1))
            if r is not None:
                text = r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
                if text.startswith("```"):
                    text = text.split("\n", 1)[1].rsplit("```", 1)[0]
                out = _normalize_verdict(json.loads(text))
                out["judge"] = "gemini"
                return out
        except Exception as e:
            if notes is not None:
                notes.append(f"gemini: {type(e).__name__}")
    # NVIDIA's vision NIMs cap at ONE image per prompt ("At most 1 image(s) may be
    # provided"), so this rung gets the middle frame only — a single mid-take frame
    # still catches blur/darkness/wrong-subject, which is what the fallback is for.
    out = _nvidia_review(frames[len(frames) // 2:len(frames) // 2 + 1], context, notes)
    if out:
        return out
    # Last rung, FULL SIZE FIRST. This used to send 2 frames re-sampled to 448px to
    # dodge a 413 that no longer occurs — a 3-frame 768px request now returns 200,
    # and Groq bills a flat ~790 tokens per image regardless of resolution, so the
    # only cost of full size is the third frame. The downsample was not free: on the
    # same clip the 448px thumbnails passed it clean while full size caught
    # "background car distorts and disappears". We were handing the judge degraded
    # thumbnails and then asking it to rate sharpness.
    probe: list[str] = []
    out = _groq_review(frames, context, probe)
    if out:
        return out
    # Fall back to the light payload only when the full-size call was REJECTED for
    # size or rate (413/429). A 404 or 401 repeats identically when smaller, and
    # each wasted round-trip blocks the render thread.
    if any(("413" in p or "429" in p) for p in probe):
        try:
            small = _frames_b64(path, n=2, width=448, q=6)
        except Exception:
            small = frames
        out = _groq_review(small, context, probe)
        if out:
            return out
    if notes is not None:
        notes.extend(probe)
    return None


_IDENTITY_RUBRIC = """\
You check CHARACTER IDENTITY between two images of the same (possibly cartoon) character.
Image 1 is the APPROVED reference still. Image 2 is frame 0 of a new video take.
Is the character in image 2 the SAME character as image 1 — same face shape, same
hairstyle/hair colour, same clothing items and colours? IGNORE pose, expression,
mouth position, lighting, framing and small crops. Flag ONLY a clear identity break:
a garment gone or replaced (e.g. vest missing, new collar), different hair style or
colour, or a clearly different face.
Return STRICT JSON only: {"same": true|false, "reason": "<short phrase>"}"""


def identity_check(frame_path: str, ref_path: str) -> dict:
    """Frame-0 vs the approved keyframe: is this still the same character?
    ADVISORY — degrades OPEN: any judge failure returns same=True so an outage can
    never block or re-roll a render. The caller treats same=False as a bounded
    re-roll signal (nextplan Phase 1 identity backstop)."""
    if not QC_GEMINI_API_KEY:
        return {"same": True, "reason": "no judge configured"}
    try:
        mimes = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                 ".webp": "image/webp"}

        def _part(p: str) -> dict:
            mime = mimes.get(Path(p).suffix.lower(), "image/png")
            return {"inline_data": {"mime_type": mime,
                                    "data": base64.b64encode(Path(p).read_bytes()).decode()}}
        body = {
            "system_instruction": {"parts": [{"text": _IDENTITY_RUBRIC}]},
            "contents": [{"role": "user", "parts": [
                {"text": "Image 1 — the APPROVED reference still:"},
                _part(ref_path),
                {"text": "Image 2 — frame 0 of the new take:"},
                _part(frame_path),
            ]}],
            "generationConfig": {"temperature": 0.0, "response_mime_type": "application/json"},
        }
        r = None
        for i in range(3):
            try:
                r = httpx.post(_URL.format(model=_VISION_MODEL),
                               headers={"x-goog-api-key": QC_GEMINI_API_KEY},
                               json=body, timeout=60)
                r.raise_for_status()
                break
            except httpx.HTTPStatusError as e:
                r = None
                if i == 2 or e.response.status_code not in (500, 503):
                    break  # 429/4xx: degrade open now, don't drain quota
                time.sleep(2 * (i + 1))
            except httpx.HTTPError:  # transport blip (connect/read timeout) — retry too
                r = None
                if i == 2:
                    break
                time.sleep(2 * (i + 1))
        if r is None:
            return {"same": True, "reason": "judge unavailable"}
        text = r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]
        out = json.loads(text)
        return {"same": bool(out.get("same", True)),
                "reason": str(out.get("reason") or "")[:160]}
    except Exception:
        return {"same": True, "reason": "judge error"}


def review_clip(path: str, context: str = "") -> dict:
    """Full QC verdict for one take: local checks + vision rubric.

    ok=False means a client-rejectable defect (worth a re-roll). sharpness==3
    passes but scores lower, so a re-rolled sharper take still wins best-of-N."""
    rec: dict = {"clip": Path(path).name, "blur": blur_mean(path),
                 "frozen_s": freeze_scan(path), "blown_pct": blown_pct(path),
                 "mean_luma": mean_luma(path),
                 "vision": None,
                 "issues": [], "ok": True, "score": 0.0,
                 "vision_failures": []}
    if rec["frozen_s"] > FREEZE_FAIL_S:
        rec["issues"].append(f"frozen frames for {rec['frozen_s']:.1f}s")
    # Haze, as a LOCAL check. It belongs here rather than in the vision rubric
    # because it is exactly measurable and the vision rungs are the first thing to
    # go dark under quota. Shots a client twice called "very hazy" measured 14-19%
    # of frame clipped to white and passed every gate we had.
    if rec["blown_pct"] is not None and rec["blown_pct"] > BLOWN_FAIL_PCT:
        rec["issues"].append(
            f"hazy: {rec['blown_pct']:.0f}% of frame blown to white "
            f"(a window or doorway behind the subject)")
    if rec["mean_luma"] is not None and rec["mean_luma"] < DARK_FAIL_YAVG:
        rec["issues"].append(
            f"too dark: average brightness {rec['mean_luma']:.0f} against ~106 on a "
            f"good reference (use a pale wall behind the subject, not dark wood)")
    v = vision_review(path, context, rec["vision_failures"])
    if v is not None:
        rec["vision"] = v
        if v["sharpness"] <= 2:
            rec["issues"].append("unusably soft")
        if not v["anatomy_ok"]:
            rec["issues"].append(f"anatomy fail{': ' + v['issue'] if v['issue'] else ''}")
        if not v["props_ok"]:
            rec["issues"].append(f"prop glitch{': ' + v['issue'] if v['issue'] else ''}")
        if not v["matches_brief"]:
            # Central subject missing IS seed-fixable (prompt following varies
            # per seed) — re-roll. Minor drift never reaches here per the rubric.
            rec["issues"].append(f"misses brief{': ' + v['issue'] if v['issue'] else ''}")
        if v["brand_legible"] == "no":
            rec["issues"].append("brand text garbled")
        if v["product_ok"] == "no":
            # a contact beat without its real product (or with a warped label)
            # is unusable for the advertiser — worth every re-roll
            rec["issues"].append(f"product missing/warped{': ' + v['issue'] if v['issue'] else ''}")
        if not v["exposure_ok"]:
            rec["issues"].append("bad exposure")
        rec["score"] = (v["sharpness"]
                        + 2.0 * v["anatomy_ok"] + 2.0 * v["props_ok"]
                        + 1.5 * v["matches_brief"]
                        + 1.5 * (v["brand_legible"] != "no")
                        + 1.5 * (v["product_ok"] != "no") + 1.0 * v["exposure_ok"])
    else:
        rec["score"] = 5.0  # vision unavailable — local checks only, neutral base
    rec["score"] -= min(4.0, 2.0 * rec["frozen_s"])
    if rec["blur"] is not None:
        # Same-shot tiebreak only: nudge toward the crisper take.
        rec["score"] -= min(0.5, rec["blur"] * 0.02)
    rec["score"] = round(rec["score"], 2)
    rec["ok"] = not rec["issues"]
    return rec


def write_sidecar(final_path: str, records: list[dict]) -> None:
    """Persist per-shot QC takes next to the final ({name}-qc.json) so the
    Library/timeline can show why a shot was re-rolled."""
    if not records:
        return
    p = Path(final_path)
    (p.parent / (p.stem.replace("-final", "") + "-qc.json")).write_text(
        json.dumps(records, indent=1))
