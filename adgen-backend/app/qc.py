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

# Second judge: Groq-hosted Llama-4 vision (OpenAI-compatible API, separate
# vendor = truly independent quota). Used only when the Gemini pass fails —
# the gate must never go blind just because one vendor throttles us.
GROQ_API_KEY = (os.getenv("GROQ_API_KEY") or "").strip().strip("\"'“”")
if GROQ_API_KEY and not GROQ_API_KEY.startswith("gsk_"):
    GROQ_API_KEY = ""  # a non-Groq paste (e.g. an AIza Google key) — ignore it
_GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
# A freeze under this long can be a deliberate hold; over it reads as a glitch
# (the dentist audit found a 1.2s dead-frame span a viewer reads as buffering).
FREEZE_FAIL_S = 0.8

_VISION_MODEL = "gemini-2.5-flash"
_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

_RUBRIC = """\
You are a merciless ad-agency QC reviewer. The images are frames sampled in order
from ONE short AI-generated ad shot. Judge whether this take can ship.

Shot brief (what it is supposed to show):
{context}

Return STRICT JSON only:
{{"sharpness": <1-5>, "anatomy_ok": <bool>, "props_ok": <bool>,
  "matches_brief": <bool>, "brand_legible": "yes"|"no"|"n/a", "exposure_ok": <bool>,
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


def _frames_b64(path: str, n: int = 3) -> list[str]:
    dur = _duration(path)
    if dur <= 0:
        raise RuntimeError(f"unreadable clip: {path}")
    out = []
    with tempfile.TemporaryDirectory() as tmp:
        for frac in (0.15, 0.5, 0.85)[:n]:
            f = Path(tmp) / f"{frac}.jpg"
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-ss", f"{dur * frac:.2f}",
                 "-i", path, "-frames:v", "1", "-vf", "scale=768:-2", "-q:v", "4",
                 str(f)], check=True)
            out.append(base64.b64encode(f.read_bytes()).decode())
    return out


def _normalize_verdict(v: dict) -> dict:
    return {
        "sharpness": int(v.get("sharpness", 3)),
        "anatomy_ok": bool(v.get("anatomy_ok", True)),
        "props_ok": bool(v.get("props_ok", True)),
        "matches_brief": bool(v.get("matches_brief", True)),
        "brand_legible": str(v.get("brand_legible", "n/a")).lower(),
        "exposure_ok": bool(v.get("exposure_ok", True)),
        "has_face": bool(v.get("has_face", False)),
        "has_brand_text": bool(v.get("has_brand_text", False)),
        "issue": str(v.get("issue", ""))[:200],
    }


def _groq_review(frames: list[str], context: str) -> dict | None:
    """Fallback judge: Llama-4 vision on Groq, same rubric, JSON mode."""
    if not GROQ_API_KEY:
        return None
    try:
        r = httpx.post(_GROQ_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json={"model": _GROQ_MODEL,
                  "response_format": {"type": "json_object"},
                  "messages": [
                      {"role": "system", "content": _RUBRIC.format(context=context[:600] or "(no brief)")},
                      {"role": "user", "content": [
                          {"type": "text", "text": "Frames from the take, in order:"},
                          *({"type": "image_url",
                             "image_url": {"url": f"data:image/jpeg;base64,{b}"}}
                            for b in frames),
                      ]},
                  ]},
            timeout=60)
        r.raise_for_status()
        v = json.loads(r.json()["choices"][0]["message"]["content"])
        out = _normalize_verdict(v)
        out["judge"] = "groq"
        return out
    except Exception:
        return None


def vision_review(path: str, context: str) -> dict | None:
    """One rubric-scored vision pass over 3 frames: Gemini first, Groq-hosted
    Llama-4 as the independent-vendor fallback. Returns None only when BOTH
    fail — the gate must degrade, never block a render on a judge outage.

    Quota manners: on Gemini 429 we skip to Groq IMMEDIATELY (no sleep-and-
    retry, no fallback-model hop) — QC runs per take and must never drain the
    planner's quota ladder while a render thread sits blocked."""
    if not QC_GEMINI_API_KEY and not GROQ_API_KEY:
        return None
    try:
        frames = _frames_b64(path)
    except Exception:
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
                    if i == 2 or e.response.status_code not in (500, 503):
                        break  # 429/4xx: fall through to the Groq judge now
                    time.sleep(2 * (i + 1))
            if r is not None:
                text = r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
                if text.startswith("```"):
                    text = text.split("\n", 1)[1].rsplit("```", 1)[0]
                out = _normalize_verdict(json.loads(text))
                out["judge"] = "gemini"
                return out
        except Exception:
            pass
    return _groq_review(frames, context)


def review_clip(path: str, context: str = "") -> dict:
    """Full QC verdict for one take: local checks + vision rubric.

    ok=False means a client-rejectable defect (worth a re-roll). sharpness==3
    passes but scores lower, so a re-rolled sharper take still wins best-of-N."""
    rec: dict = {"clip": Path(path).name, "blur": blur_mean(path),
                 "frozen_s": freeze_scan(path), "vision": None,
                 "issues": [], "ok": True, "score": 0.0}
    if rec["frozen_s"] > FREEZE_FAIL_S:
        rec["issues"].append(f"frozen frames for {rec['frozen_s']:.1f}s")
    v = vision_review(path, context)
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
        if not v["exposure_ok"]:
            rec["issues"].append("bad exposure")
        rec["score"] = (v["sharpness"]
                        + 2.0 * v["anatomy_ok"] + 2.0 * v["props_ok"]
                        + 1.5 * v["matches_brief"]
                        + 1.5 * (v["brand_legible"] != "no") + 1.0 * v["exposure_ok"])
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
