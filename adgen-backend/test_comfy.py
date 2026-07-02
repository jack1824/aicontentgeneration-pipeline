"""Chunk 2 test: the ComfyUI pod client (transport layer).

Two modes:
  - offline: verifies output-file parsing (find_output_file) against a sample history dict.
             Runs with no pod, no network.
  - live:    if COMFY_POD_URLS is set in .env, hits the pod's /object_info health check.

Run from the adgen-backend/ directory:
    ./.venv/bin/python test_comfy.py
"""
import httpx

from app.config import COMFY_POD_URLS
from app.providers import comfy

# A realistic finished-history entry: VHS_VideoCombine reports its mp4 under the "gifs" key.
SAMPLE_HISTORY_ENTRY = {
    "outputs": {
        "9": {
            "gifs": [
                {
                    "filename": "AdGen_00001.mp4",
                    "subfolder": "",
                    "type": "output",
                    "format": "video/h264-mp4",
                }
            ]
        }
    },
    "status": {"status_str": "success", "completed": True},
}


def offline_check() -> None:
    f = comfy.find_output_file(SAMPLE_HISTORY_ENTRY)
    assert f is not None and f["filename"] == "AdGen_00001.mp4", f
    print(
        f"offline OK: parsed output -> {f['filename']} "
        f"(subfolder={f.get('subfolder')!r}, type={f.get('type')!r})"
    )

    # Sanity: an entry with no outputs returns None rather than crashing.
    assert comfy.find_output_file({"outputs": {}}) is None
    print("offline OK: empty outputs -> None")


def live_check() -> None:
    if not COMFY_POD_URLS:
        print(
            "live SKIP: COMFY_POD_URLS not set in .env. Add your running pod's proxy URL "
            "(https://<pod-id>-8188.proxy.runpod.net) to run the health check."
        )
        return
    url = COMFY_POD_URLS[0]
    try:
        n = comfy.health_check(url)
    except httpx.HTTPStatusError as e:
        body = e.response.text
        if e.response.status_code == 502 and "Waiting for service" in body:
            print(
                f"live FAIL: the RunPod proxy for {url} answered, but ComfyUI is NOT serving on\n"
                f"  port 8188 (HTTP 502 'Waiting for service to respond'). The pod is up and the URL\n"
                f"  is correct — ComfyUI itself just isn't responding. To fix:\n"
                f"    1. Open {url} in a browser. Same spinner => ComfyUI isn't running.\n"
                f"    2. SSH into the pod and start it, e.g.:\n"
                f"         cd /workspace/ComfyUI && python main.py --listen 0.0.0.0 --port 8188\n"
                f"       (or wait ~30-60s if it's still booting), then re-run this test."
            )
        else:
            print(
                f"live FAIL: ComfyUI health check returned HTTP {e.response.status_code}.\n"
                f"  Body (truncated): {body[:300]}"
            )
        return
    except httpx.RequestError as e:
        print(
            f"live FAIL: could not reach {url} at all ({type(e).__name__}: {e}).\n"
            f"  Is the pod running and the URL exactly right?"
        )
        return
    print(f"live OK: pod {url} responded to /object_info with {n} node types.")


if __name__ == "__main__":
    offline_check()
    live_check()
