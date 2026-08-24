"""Provider health probes for the admin dashboard.

Why this exists: on 2026-08-24 we discovered that THREE of the four non-Gemini model
ids the platform depends on had rotted — qwen3.5-397b was 410 Gone (end-of-life a
month earlier), and two Llama ids were 404. The "three-vendor fallback ladder" had
silently been a single vendor for weeks, so one Gemini quota blip took out both the
planner and the QC vision judge at once. Nothing anywhere reported it; it surfaced
only as bad renders.

A hosted model id is a dependency that can die without your code changing. This
module makes that visible.

Probing costs real quota (Gemini free tier is ~20 requests/day PER MODEL), so results
are cached and probes only run when explicitly asked for. The dashboard never probes
on page load.
"""
import time
from concurrent.futures import ThreadPoolExecutor

import httpx

from app import qc
from app.config import COMFY_POD_URLS, ELEVENLABS_API_KEY
from app.providers import llm

# A probe is a real API call against a metered account — cache hard, refresh on demand.
CACHE_TTL_S = 600
_cache: dict = {"at": 0.0, "results": []}

OK, DEAD, THROTTLED, UNCONFIGURED = "ok", "dead", "throttled", "unconfigured"


def _classify(status: int | None, body: str) -> tuple[str, str]:
    """Map an HTTP result onto our four states.

    The distinction that matters most: THROTTLED means the dependency is fine and you
    are out of budget (wait, or pay); DEAD means the id no longer exists and no amount
    of waiting fixes it (the failure mode that hid for a month)."""
    if status is None:
        return DEAD, "unreachable"
    if status == 429:
        return THROTTLED, "rate/quota limit"
    if status in (404, 410):
        return DEAD, f"model gone ({status}) — id retired upstream"
    if status in (401, 403):
        return DEAD, f"auth rejected ({status})"
    if 200 <= status < 300:
        return OK, ""
    return DEAD, f"HTTP {status}: {body[:120]}"


def _post(url: str, headers: dict, body: dict, timeout: float = 25.0):
    try:
        r = httpx.post(url, headers=headers, json=body, timeout=timeout)
        return r.status_code, r.text
    except Exception as e:
        return None, f"{type(e).__name__}: {e}"


def _gemini(model: str, key: str, role: str) -> dict:
    if not key:
        return {"provider": "gemini", "model": model, "role": role,
                "state": UNCONFIGURED, "detail": "no API key"}
    st, body = _post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        {"x-goog-api-key": key, "Content-Type": "application/json"},
        {"contents": [{"role": "user", "parts": [{"text": "ok"}]}],
         "generationConfig": {"maxOutputTokens": 1}})
    state, detail = _classify(st, body)
    out = {"provider": "gemini", "model": model, "role": role,
           "state": state, "detail": detail}
    if st == 429:  # Google names the per-model daily cap in the error body
        for tok in ("limit: ", "quotaValue"):
            i = body.find(tok)
            if i > 0:
                out["detail"] = f"quota exhausted ({body[i:i + 40].strip()})"
                break
    return out


def _openai_style(provider: str, url: str, key: str, model: str, role: str,
                  prefix: str | None = None) -> dict:
    if not key or (prefix and not key.startswith(prefix)):
        return {"provider": provider, "model": model, "role": role,
                "state": UNCONFIGURED, "detail": "no/invalid API key"}
    st, body = _post(url, {"Authorization": f"Bearer {key}",
                           "Content-Type": "application/json"},
                     {"model": model, "max_tokens": 1,
                      "messages": [{"role": "user", "content": "ok"}]}, timeout=40)
    state, detail = _classify(st, body)
    return {"provider": provider, "model": model, "role": role,
            "state": state, "detail": detail}


def _elevenlabs() -> dict:
    if not ELEVENLABS_API_KEY:
        return {"provider": "elevenlabs", "model": "tts", "role": "voice",
                "state": UNCONFIGURED, "detail": "no API key"}
    try:
        r = httpx.get("https://api.elevenlabs.io/v1/user/subscription",
                      headers={"xi-api-key": ELEVENLABS_API_KEY}, timeout=20)
        state, detail = _classify(r.status_code, r.text)
        out = {"provider": "elevenlabs", "model": "tts", "role": "voice",
               "state": state, "detail": detail}
        if r.status_code == 200:
            d = r.json()
            used = d.get("character_count")
            cap = d.get("character_limit")
            if isinstance(used, int) and isinstance(cap, int) and cap:
                out["used"], out["limit"] = used, cap
                out["detail"] = f"{used:,}/{cap:,} characters"
                if used >= cap:
                    out["state"] = THROTTLED
        return out
    except Exception as e:
        return {"provider": "elevenlabs", "model": "tts", "role": "voice",
                "state": DEAD, "detail": f"{type(e).__name__}: {e}"}


def _pod() -> dict:
    url = (COMFY_POD_URLS[0] if COMFY_POD_URLS else "").rstrip("/")
    if not url:
        return {"provider": "comfyui", "model": "pod", "role": "render",
                "state": UNCONFIGURED, "detail": "COMFY_POD_URLS not set"}
    try:
        r = httpx.get(f"{url}/system_stats", timeout=20)
        state, detail = _classify(r.status_code, r.text)
        out = {"provider": "comfyui", "model": "pod", "role": "render",
               "state": state, "detail": detail or url}
        if r.status_code == 200:
            d = r.json()
            dev = (d.get("devices") or [{}])[0]
            free, total = dev.get("vram_free"), dev.get("vram_total")
            if isinstance(free, int) and isinstance(total, int) and total:
                out["detail"] = (f"{dev.get('name', 'GPU')} — "
                                 f"{free / 2**30:.1f}/{total / 2**30:.1f} GB VRAM free")
                out["vram_free_pct"] = round(100 * free / total)
        return out
    except Exception as e:
        return {"provider": "comfyui", "model": "pod", "role": "render",
                "state": DEAD, "detail": f"{type(e).__name__}: {e}"}


def probe_all(force: bool = False) -> dict:
    """Every external dependency, probed in parallel. Cached — see CACHE_TTL_S."""
    age = time.time() - _cache["at"]
    if not force and _cache["results"] and age < CACHE_TTL_S:
        return {"cached": True, "age_s": round(age), "results": _cache["results"]}

    jobs = [
        lambda: _gemini(llm.GEMINI_MODEL, llm.GEMINI_API_KEY, "planner"),
        lambda: _gemini(llm.GEMINI_FALLBACK_MODEL, llm.GEMINI_API_KEY, "planner-fallback"),
        lambda: _gemini(qc._VISION_MODEL, qc.QC_GEMINI_API_KEY, "qc-vision"),
        lambda: _openai_style("nvidia", llm.NVIDIA_URL, llm.NVIDIA_API_KEY,
                              llm.NVIDIA_MODEL, "planner-fallback-2", "nvapi-"),
        lambda: _openai_style("nvidia", qc._NVIDIA_URL, qc.NVIDIA_API_KEY,
                              qc._NVIDIA_MODEL, "qc-vision-fallback", "nvapi-"),
        lambda: _openai_style("groq", llm.GROQ_URL, llm.GROQ_API_KEY,
                              llm.GROQ_MODEL, "planner-fallback-3", "gsk_"),
        lambda: _openai_style("groq", qc._GROQ_URL, qc.GROQ_API_KEY,
                              qc._GROQ_MODEL, "qc-vision-fallback-2", "gsk_"),
        _elevenlabs,
        _pod,
    ]
    with ThreadPoolExecutor(max_workers=len(jobs)) as ex:
        results = [f.result() for f in [ex.submit(j) for j in jobs]]

    _cache["at"] = time.time()
    _cache["results"] = results
    return {"cached": False, "age_s": 0, "results": results}


def ladder_health(results: list[dict]) -> list[dict]:
    """Per-role ladder verdicts.

    A ladder with a live top rung still counts as DEGRADED when its fallbacks are
    dead: that is precisely the state we sat in for a month, one quota blip away from
    an outage, with every render looking fine until it wasn't."""
    roles = {"planner": ["planner", "planner-fallback", "planner-fallback-2",
                         "planner-fallback-3"],
             "qc-vision": ["qc-vision", "qc-vision-fallback", "qc-vision-fallback-2"]}
    by_role = {r["role"]: r for r in results}
    out = []
    for name, rungs in roles.items():
        live = [r for r in rungs if (by_role.get(r) or {}).get("state") == OK]
        present = [r for r in rungs if r in by_role]
        broken = [r for r in present if (by_role.get(r) or {}).get("state") == DEAD]
        if not live:
            verdict, sev = "OUTAGE — no working rung", "red"
        elif broken:
            verdict, sev = (f"DEGRADED — {len(live)}/{len(present)} rungs live, "
                            f"no safety net if the top rung throttles"), "amber"
        else:
            verdict, sev = f"healthy — {len(live)}/{len(present)} rungs live", "green"
        out.append({"ladder": name, "verdict": verdict, "severity": sev,
                    "live": live, "dead": broken})
    return out
