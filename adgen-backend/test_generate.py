"""Chunk 3 test: generate ONE real Wan t2v clip from the pod, end to end.

inject prompt+seed -> POST /prompt -> poll /history -> download via /view.
Requires COMFY_POD_URLS in .env and workflows/wan_t2v.json.

Run from adgen-backend/:
    ./.venv/bin/python test_generate.py
NOTE: QUALITY mode (20 steps) — this takes several minutes on the pod. The script
polls with a heartbeat so you can see it's alive.
"""
import os
import time

from app.config import COMFY_POD_URLS
from app.providers import comfy
from app.workflow_mappings import WAN_T2V_MAPPING

PROMPT = (
    "A premium glass bottle of golden honey on a rustic wooden table, morning sunlight "
    "streaming through a kitchen window, slow camera push-in, honey dripping from a wooden "
    "dipper in slow motion, warm cinematic lighting, shallow depth of field, advertisement style."
)
SEED = 42


def main() -> None:
    if not COMFY_POD_URLS:
        raise SystemExit("COMFY_POD_URLS is not set in .env — add the pod URL first.")
    pod = COMFY_POD_URLS[0]

    wf = comfy.load_workflow("wan_t2v")
    print(f"pod:    {pod}")
    print(f"prompt: {PROMPT[:80]}...")
    print(f"seed:   {SEED}")

    wf = comfy.inject_inputs(wf, {"prompt": PROMPT, "seed": SEED}, WAN_T2V_MAPPING)
    prompt_id = comfy.submit_prompt(pod, wf)
    print(f"submitted: prompt_id={prompt_id}")

    start = time.monotonic()
    print("polling (QUALITY 20-step mode — expect several minutes)...")
    entry = None
    while entry is None:
        try:
            entry = comfy.poll_until_done(pod, prompt_id, timeout=60, interval=3)
        except TimeoutError:
            elapsed = int(time.monotonic() - start)
            print(f"  ... still generating ({elapsed}s elapsed)")
    elapsed = int(time.monotonic() - start)

    out = comfy.download_output(pod, entry, out_path="clip_0.mp4")
    size = os.path.getsize(out)
    print(f"\nDONE in {elapsed}s: wrote {out} ({size:,} bytes)")
    print("Play it back to confirm a real clip came out of the pod.")


if __name__ == "__main__":
    main()
