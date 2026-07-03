"""Loads configuration from environment variables (via a .env file).

Per adgen-platform/mdfiles/13-orchestrator-starter-code.md. Only the values needed by the
chunk currently built are wired here; later chunks add Gemini / RunPod / database config.
No secrets are hardcoded — everything comes from the environment.
"""
import os

from dotenv import load_dotenv

load_dotenv()

# --- ElevenLabs (audio TTS — the only paid audio API; file 14) ---
# 🔴 NEEDS: ELEVENLABS_API_KEY
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
# 🔴 NEEDS: ELEVENLABS_VOICE_ID (a Hindi-capable voice)
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID")

# --- Gemini (planning/routing LLM — free tier; swappable behind providers/llm.py) ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# --- ComfyUI on RunPod (video generation; pod transport for now; file 06/14) ---
# 🔴 NEEDS: at least one pod proxy URL (https://<pod-id>-8188.proxy.runpod.net).
# Comma-separated for multiple pods. Directly reachable over HTTP — no RUNPOD_API_KEY
# needed for generation (that key is only for start/stop pod lifecycle, a later chunk).
COMFY_POD_URLS = [u.strip() for u in os.getenv("COMFY_POD_URLS", "").split(",") if u.strip()]

# Later chunks will add GEMINI_API_KEY, RUNPOD_SERVERLESS_ENDPOINT, RUNPOD_API_KEY, and
# DATABASE_URL here as those pipelines are built. Not wired yet.
