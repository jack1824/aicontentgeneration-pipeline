"""Admin / ops dashboard API.

Everything here answers one question: "is the machine lying to me right now?"

Every incident on 2026-08-24 shared a shape — the system kept running and kept
producing files, while the thing that was supposed to catch the problem had itself
quietly failed. A blurred render passed because QC's vision judge was blind. A
cartoon shipped because nothing compared the ad to its brief. A narration was cut
mid-CTA because the code that noticed the overrun truncated it anyway.

So these endpoints do not just report status. They score finished artifacts against
thresholds measured from known-good and known-bad renders, and they say plainly when
a safety net is down.

Mounted under /admin. Read-only: nothing here can start, stop or mutate a render.
"""
import json
import subprocess
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse

from app import adminprobe, adminstore, qc
from app.assembly import ffmpeg
from app.providers import llm

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_HTML = Path(__file__).resolve().parents[2] / "admin" / "index.html"
OUTPUTS = Path("outputs")

# ---------------------------------------------------------------------------
# Thresholds. These are MEASURED, not guessed — from real clips on this machine:
#   known-good LTX (distilled LoRA at 0.5): blur_mean 10.41 / frozen 0.12s
#   known-bad  LTX (LoRA forced to 0.0)   : blur_mean  5.85 / frozen 4.80s
#   the repaired render                    : blur_mean  8.95 / frozen 0.92s
# A clip whose freeze span approaches its own duration is not "a bit static" — it
# is a failed sample, which is why frozen is scored as a FRACTION of duration.
BLUR_RED, BLUR_AMBER = 6.5, 8.0
FROZEN_FRAC_RED, FROZEN_FRAC_AMBER = 0.5, 0.2
# Trailing silence past this reads as "the ad is broken" to a viewer (client note).
DEAD_TAIL_RED, DEAD_TAIL_AMBER = 2.0, 1.0


def _sev(*severities: str) -> str:
    for s in ("red", "amber", "green"):
        if s in severities:
            return s
    return "green"


# ---------------------------------------------------------------------------
# Overview
# ---------------------------------------------------------------------------
@router.get("/api/overview")
def overview():
    from app.main import JOBS  # imported late: main imports this router

    active = [j for j in JOBS.values() if j.get("status") in ("queued", "planning",
                                                              "generating", "assembling",
                                                              "tts", "uploading", "post")]
    day = adminstore.counts_since(86400)
    week = adminstore.counts_since(7 * 86400)
    probe = adminprobe.probe_all()  # cached; never probes on a page load
    ladders = adminprobe.ladder_health(probe["results"])
    down = [r for r in probe["results"] if r["state"] == adminprobe.DEAD]
    throttled = [r for r in probe["results"] if r["state"] == adminprobe.THROTTLED]

    return {
        "now": time.time(),
        "active_jobs": len(active),
        "active": [{"job_id": k, **{f: v.get(f) for f in
                                    ("status", "progress", "detail", "kind", "name")},
                    "warnings": len(v.get("warnings") or [])}
                   for k, v in JOBS.items()
                   if v.get("status") in ("queued", "planning", "generating",
                                          "assembling", "tts", "uploading", "post")],
        "today": {"renders_done": day.get(adminstore.JOB_DONE, 0),
                  "errors": day.get(adminstore.JOB_ERROR, 0),
                  "cancelled": day.get(adminstore.JOB_CANCELLED, 0),
                  "warnings": day.get(adminstore.WARNING, 0)},
        "week": {"renders_done": week.get(adminstore.JOB_DONE, 0),
                 "errors": week.get(adminstore.JOB_ERROR, 0),
                 "warnings": week.get(adminstore.WARNING, 0)},
        "providers": {"down": len(down), "throttled": len(throttled),
                      "total": len(probe["results"]),
                      "probe_age_s": probe["age_s"]},
        "ladders": ladders,
        "jobs_are_in_memory": True,  # the UI says so out loud — history != JOBS
    }


# ---------------------------------------------------------------------------
# Providers / API limits
# ---------------------------------------------------------------------------
@router.get("/api/providers")
def providers(force: bool = Query(False, description="spend real quota on a fresh probe")):
    d = adminprobe.probe_all(force=force)
    if force:
        adminstore.emit(adminstore.PROVIDER_PROBE,
                        results=[{k: r[k] for k in ("provider", "model", "role", "state")}
                                 for r in d["results"]])
    return {**d, "ladders": adminprobe.ladder_health(d["results"]),
            "cache_ttl_s": adminprobe.CACHE_TTL_S}


# ---------------------------------------------------------------------------
# Jobs + errors
# ---------------------------------------------------------------------------
@router.get("/api/jobs")
def jobs(limit: int = Query(60, ge=1, le=500)):
    from app.main import JOBS

    live = [{"job_id": k, "live": True,
             **{f: v.get(f) for f in ("status", "progress", "detail", "kind", "name",
                                      "error", "error_kind", "video_path", "created")},
             "warnings": list(v.get("warnings") or [])}
            for k, v in JOBS.items()]
    live.sort(key=lambda j: j.get("created") or 0, reverse=True)

    seen = {j["job_id"] for j in live}
    past = []
    for e in adminstore.read(limit=limit * 4,
                             kinds={adminstore.JOB_DONE, adminstore.JOB_ERROR,
                                    adminstore.JOB_CANCELLED}):
        jid = e.get("job_id")
        if not jid or jid in seen:
            continue
        seen.add(jid)
        past.append({"job_id": jid, "live": False, "created": e.get("ts"),
                     "status": {"job_done": "done", "job_error": "error",
                                "job_cancelled": "cancelled"}[e["kind"]],
                     "progress": 100 if e["kind"] == adminstore.JOB_DONE else None,
                     "kind": e.get("job_kind"), "name": e.get("name"),
                     "error": e.get("error"), "error_kind": e.get("error_kind"),
                     "video_path": e.get("video_path"),
                     "elapsed_s": e.get("elapsed_s"),
                     "warnings": e.get("warnings") or []})
        if len(past) >= limit:
            break
    return {"jobs": (live + past)[:limit], "live_count": len(live)}


@router.get("/api/events")
def events(limit: int = Query(200, ge=1, le=2000), kind: str | None = None):
    kinds = {k.strip() for k in kind.split(",")} if kind else None
    return {"events": adminstore.read(limit=limit, kinds=kinds)}


# ---------------------------------------------------------------------------
# Render quality + audio health of FINISHED artifacts
# ---------------------------------------------------------------------------
def _probe_streams(path: str) -> dict:
    """Per-stream durations. format.duration is the MAX of the streams, so it hides
    exactly the mismatch we care about (video ends, audio keeps going, or vice versa)."""
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries",
             "stream=codec_type,duration,width,height", "-show_entries",
             "format=duration", "-of", "json", path],
            capture_output=True, text=True, timeout=30)
        d = json.loads(r.stdout or "{}")
    except Exception:
        return {}
    out = {"format_s": float((d.get("format") or {}).get("duration") or 0)}
    for s in d.get("streams", []):
        t = s.get("codec_type")
        if t == "video":
            out["video_s"] = float(s.get("duration") or 0)
            out["w"], out["h"] = s.get("width"), s.get("height")
        elif t == "audio":
            out["audio_s"] = float(s.get("duration") or 0)
    return out


def _tail_peak_db(path: str, window_s: float = 0.35) -> float | None:
    """Peak level over the final `window_s`. This is what separates "the voice ended"
    from "the voice was cut off" — a natural ending decays into silence, a cut leaves
    the waveform loud at the last sample."""
    try:
        r = subprocess.run(
            ["ffmpeg", "-sseof", f"-{window_s}", "-i", path, "-af", "volumedetect",
             "-f", "null", "-"], capture_output=True, text=True, timeout=30)
        for line in r.stderr.splitlines():
            if "max_volume:" in line:
                return float(line.split("max_volume:")[1].replace("dB", "").strip())
    except Exception:
        pass
    return None


# Calibrated on real files from this machine (2026-08-24):
#   known-truncated final  -> tail peak -19.2 dB, 7 silences  (cut mid-CTA)
#   the same ad, repaired  -> tail peak -91.0 dB, 8 silences  (decays to silence)
#   ambience-only LTX clip -> tail peak  -5.1 dB, 0 silences  (never speech-shaped)
# So loudness ALONE is not truncation: continuous music/ambience is legitimately loud
# at the last sample. Truncation = speech-shaped audio (it has pauses) that is still
# loud when the file ends.
TAIL_LOUD_DB = -40.0


def _audio_health(path: str, streams: dict) -> dict:
    """Score a finished mp4's audio.

    Two distinct failures, often confused: DEAD TAIL (silence after the voice ends —
    reads as a bug to a viewer) and TRUNCATION (the voice was cut off — the worse one,
    because the message itself is lost)."""
    if "audio_s" not in streams:
        return {"severity": "red", "issue": "no audio stream", "dead_tail_s": None}
    dur = streams.get("audio_s") or 0
    try:
        smap = ffmpeg.silence_map(path)
    except Exception:
        return {"severity": "amber", "issue": "could not analyse audio",
                "dead_tail_s": None}
    sil = smap.get("silences") or []
    tail = 0.0
    if sil and abs((sil[-1].get("end") or 0) - dur) < 0.25:
        tail = round(dur - (sil[-1].get("start") or dur), 2)

    peak = _tail_peak_db(path)
    speech_shaped = len(sil) > 0          # pauses => a voice track, not a music bed
    ends_loud = peak is not None and peak > TAIL_LOUD_DB

    issues, sev = [], "green"
    if tail >= DEAD_TAIL_RED:
        issues.append(f"{tail:.1f}s of dead air at the end"); sev = "red"
    elif tail >= DEAD_TAIL_AMBER:
        issues.append(f"{tail:.1f}s of dead air at the end"); sev = "amber"
    if speech_shaped and ends_loud:
        issues.append(f"ends mid-speech at {peak:.0f} dB — narration looks truncated")
        sev = "red"
    speech = max(0.0, dur - sum((s.get("end", 0) - s.get("start", 0)) for s in sil))
    if dur and speech_shaped and speech / dur < 0.25:
        issues.append("mostly silent"); sev = _sev(sev, "amber")
    return {"severity": sev, "issue": "; ".join(issues), "dead_tail_s": tail,
            "tail_peak_db": peak, "speech_s": round(speech, 1),
            "audio_s": round(dur, 2), "speech_shaped": speech_shaped}


def _quality_health(path: str, streams: dict) -> dict:
    try:
        blur = qc.blur_mean(path)
        frozen = qc.freeze_scan(path)
    except Exception:
        return {"severity": "amber", "issue": "could not analyse video",
                "blur": None, "frozen_s": None}
    dur = streams.get("video_s") or streams.get("format_s") or 0
    frac = (frozen / dur) if dur else 0
    issues, sev = [], "green"
    if blur < BLUR_RED:
        issues.append(f"unusably soft (sharpness {blur:.1f})"); sev = "red"
    elif blur < BLUR_AMBER:
        issues.append(f"soft (sharpness {blur:.1f})"); sev = "amber"
    if frac >= FROZEN_FRAC_RED:
        issues.append(f"frozen {frozen:.1f}s of {dur:.1f}s — failed sample"); sev = "red"
    elif frac >= FROZEN_FRAC_AMBER:
        issues.append(f"frozen {frozen:.1f}s"); sev = _sev(sev, "amber")
    return {"severity": sev, "issue": "; ".join(issues), "blur": round(blur, 2),
            "frozen_s": round(frozen, 2), "frozen_frac": round(frac, 2)}


def _consistency_health(path: str) -> dict:
    """Read the QC sidecar next to a render. A sidecar whose takes all show judge='-'
    means the vision judge never ran — the render was never actually checked against
    its brief, which is how a cartoon shipped for a photoreal brief."""
    p = Path(path)
    for cand in (p.with_name(p.stem.rsplit("-final", 1)[0] + "-qc.json"),
                 p.with_name(p.stem + "-qc.json")):
        if cand.exists():
            try:
                recs = json.loads(cand.read_text())
            except Exception:
                continue
            if not isinstance(recs, list) or not recs:
                continue
            judged = [r for r in recs if (r.get("vision") or {}).get("judge")]
            missed = [r for r in recs
                      if (r.get("vision") or {}).get("matches_brief") is False]
            shipped_failing = [r for r in recs if r.get("shipped") and not r.get("ok")]
            if not judged:
                return {"severity": "red", "takes": len(recs), "judged": 0,
                        "issue": "vision QC never ran — nothing checked this against "
                                 "the brief"}
            sev = "green"
            issues = []
            if missed:
                issues.append(f"{len(missed)} take(s) did not match the brief")
                sev = "red"
            if shipped_failing:
                issues.append(f"{len(shipped_failing)} failing take(s) shipped anyway")
                sev = _sev(sev, "amber")
            return {"severity": sev, "takes": len(recs), "judged": len(judged),
                    "issue": "; ".join(issues),
                    "judges": sorted({(r.get("vision") or {}).get("judge")
                                      for r in judged if (r.get("vision") or {}).get("judge")})}
    return {"severity": "amber", "takes": 0, "judged": 0,
            "issue": "no QC record — this render was never reviewed"}


@router.get("/api/renders")
def renders(limit: int = Query(12, ge=1, le=60)):
    """Recent finished ads, each scored for the three failure classes."""
    finals = sorted(
        [p for g in ("video/*final*.mp4", "sequence/video/*final*.mp4",
                     "ltx2/video/*final*.mp4", "ingredients/video/*final*.mp4")
         for p in OUTPUTS.glob(g)],
        key=lambda p: p.stat().st_mtime, reverse=True)[:limit]
    out = []
    for p in finals:
        sp = str(p)
        streams = _probe_streams(sp)
        audio = _audio_health(sp, streams)
        quality = _quality_health(sp, streams)
        cons = _consistency_health(sp)
        av_gap = None
        if streams.get("video_s") and streams.get("audio_s"):
            av_gap = round(abs(streams["video_s"] - streams["audio_s"]), 2)
        out.append({
            "name": p.name, "path": sp, "mtime": p.stat().st_mtime,
            "size_mb": round(p.stat().st_size / 2**20, 1),
            "duration_s": round(streams.get("format_s") or 0, 2),
            "resolution": (f"{streams.get('w')}x{streams.get('h')}"
                           if streams.get("w") else None),
            "av_gap_s": av_gap,
            "audio": audio, "quality": quality, "consistency": cons,
            "severity": _sev(audio["severity"], quality["severity"], cons["severity"]),
        })
    return {"renders": out, "thresholds": {
        "blur_red": BLUR_RED, "blur_amber": BLUR_AMBER,
        "frozen_frac_red": FROZEN_FRAC_RED, "dead_tail_red": DEAD_TAIL_RED}}


# ---------------------------------------------------------------------------
# Model params
# ---------------------------------------------------------------------------
@router.get("/api/params")
def params():
    """Effective render params per pipeline, read from the workflow graphs themselves.

    Reading the GRAPH rather than a hardcoded table is the point: the LoRA-strength
    regression was invisible in code review but obvious here, because the graph says
    8 base steps at cfg 1.0 — a schedule that only converges with the distilled LoRA
    loaded."""
    from app import pipeline as pl

    wf_dir = Path("workflows")
    graphs = {}
    for f in sorted(wf_dir.glob("*.json")):
        try:
            g = json.loads(f.read_text())
        except Exception:
            continue
        info = {"nodes": len(g), "loras": [], "sigmas": [], "cfg": [], "samplers": []}
        for nid, n in g.items():
            ct, ins = n.get("class_type", ""), n.get("inputs", {})
            if "Lora" in ct:
                info["loras"].append({"node": nid,
                                      "name": str(ins.get("lora_name"))[:70],
                                      "strength": ins.get("strength_model")})
            elif "ManualSigmas" in ct:
                s = str(ins.get("sigmas", ""))
                info["sigmas"].append({"node": nid, "steps": len(s.split(",")) - 1,
                                       "schedule": s[:80]})
            elif "Guider" in ct and "cfg" in ins:
                info["cfg"].append({"node": nid, "cfg": ins.get("cfg")})
            elif "KSamplerSelect" in ct:
                info["samplers"].append({"node": nid,
                                         "sampler": ins.get("sampler_name")})
        graphs[f.stem] = info

    return {
        "graphs": graphs,
        "constants": {
            "planner_model": llm.GEMINI_MODEL,
            "planner_fallback": llm.GEMINI_FALLBACK_MODEL,
            "planner_nvidia": llm.NVIDIA_MODEL,
            "planner_groq": llm.GROQ_MODEL,
            "plan_approaches": getattr(llm, "PLAN_APPROACHES", None),
            "qc_vision_model": qc._VISION_MODEL,
            "qc_nvidia_model": qc._NVIDIA_MODEL,
            "qc_groq_model": qc._GROQ_MODEL,
            "qc_max_takes": qc.QC_MAX_TAKES,
            "freeze_fail_s": qc.FREEZE_FAIL_S,
            "identity_retries": getattr(pl, "IDENTITY_RETRIES", None),
            "fit_max_tempo": ffmpeg.FIT_MAX_TEMPO,
            "fit_tail_s": ffmpeg.FIT_TAIL_S,
            "fit_min_out_s": ffmpeg.FIT_MIN_OUT_S,
        },
        "danger_params": [
            {"param": "lora_strength on ltx2_av (node 232)",
             "safe": 0.5, "why":
             "ltx2_av is a DISTILLED graph — 8 base + 3 refine steps at cfg 1.0. "
             "Forcing this to 0 removes the distillation but keeps the short "
             "schedule, so the sampler never converges: every clip came back "
             "unusably soft, black or frozen. Caused the 2026-08-24 outage."},
            {"param": "cast_ids / character_ids",
             "safe": "only when named", "why":
             "Saved character anchors are pasted VERBATIM into every shot. Sending "
             "the whole saved library made an unrelated photoreal brand film render "
             "as a cartoon."},
            {"param": "qc vision model vs planner model",
             "safe": "must differ", "why":
             "Gemini free tier meters ~20 requests/day PER MODEL. Sharing one model "
             "between QC and the planner makes them starve each other."},
        ],
    }


# ---------------------------------------------------------------------------
# Static page
# ---------------------------------------------------------------------------
@router.get("/")
def index():
    if not ADMIN_HTML.exists():
        raise HTTPException(404, f"admin UI not found at {ADMIN_HTML}")
    return FileResponse(str(ADMIN_HTML), media_type="text/html")


@router.get("/api/health")
def admin_health():
    return JSONResponse({"ok": True, "ui": ADMIN_HTML.exists()})
