"""ComfyUI-on-RunPod provider (pod transport).

Drives a ComfyUI pod over HTTP: submit a workflow, poll until done, download the output.
This is the single, swappable video seam (golden rule, file 00) — the rest of the app only
calls `comfy_generate()`. When we move to RunPod serverless later, only this module's request
plumbing changes; callers stay the same.

Pod API (file 06):
    POST {pod}/prompt            -> {"prompt_id": ...}
    GET  {pod}/history/{id}      -> {} until done, then {id: {outputs, status}}
    GET  {pod}/view?filename=&subfolder=&type=output   -> the output bytes
    GET  {pod}/object_info       -> node catalog (used as a health check)

This chunk builds the transport (submit/poll/download/health) + a generic, mapping-driven
`inject_inputs`. The concrete `wan_t2v` node mapping and a real generated clip land in the next
chunk, once the workflow JSON is exported.
"""
import copy
import json
import time
import uuid

import httpx

# These jobs run for minutes, not seconds (≈760s at 20-step on the A40 — file 10), so the poll
# timeout is deliberately generous.
DEFAULT_TIMEOUT = 1800.0   # seconds to wait for a job before giving up
DEFAULT_POLL_INTERVAL = 2.0
# Output keys a ComfyUI save/output node may use, in the order we prefer them. VHS_VideoCombine
# (the usual video output node) writes its mp4 under "gifs" — not "videos" — so it comes first.
_OUTPUT_KEYS = ("gifs", "videos", "images", "audio")


def _base(pod_url: str) -> str:
    """Normalize a pod URL (drop any trailing slash)."""
    return pod_url.rstrip("/")


def _surface_http_error(e: httpx.HTTPStatusError, what: str) -> "httpx.HTTPStatusError":
    """Re-raise an httpx error with ComfyUI's response body included (not a bare status code)."""
    return httpx.HTTPStatusError(
        f"{what} failed ({e.response.status_code}): {e.response.text[:1000]}",
        request=e.request,
        response=e.response,
    )


def health_check(pod_url: str, timeout: float = 30.0) -> int:
    """GET /object_info to confirm the pod is reachable. Returns the number of node types.

    Raises a clear error if the pod is unreachable or returns a non-2xx.
    """
    try:
        r = httpx.get(f"{_base(pod_url)}/object_info", timeout=timeout)
        r.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise _surface_http_error(e, "ComfyUI /object_info") from None
    return len(r.json())


def submit_prompt(pod_url: str, workflow_json: dict, client_id: str | None = None) -> str:
    """POST a workflow (API format) to /prompt. Returns the prompt_id."""
    client_id = client_id or str(uuid.uuid4())
    body = {"prompt": workflow_json, "client_id": client_id}
    try:
        r = httpx.post(f"{_base(pod_url)}/prompt", json=body, timeout=60)
        r.raise_for_status()
    except httpx.HTTPStatusError as e:
        # ComfyUI returns 400 with a node-validation error body when the graph is malformed —
        # surface it so the cause is visible rather than a bare 400.
        raise _surface_http_error(e, "ComfyUI /prompt") from None
    return r.json()["prompt_id"]


def poll_until_done(
    pod_url: str,
    prompt_id: str,
    timeout: float = DEFAULT_TIMEOUT,
    interval: float = DEFAULT_POLL_INTERVAL,
) -> dict:
    """Poll GET /history/{prompt_id} until the job finishes. Returns the history entry.

    Raises TimeoutError past `timeout`, or RuntimeError if ComfyUI reports the job errored.
    Transient network failures (connect/read timeouts, proxy 502 HTML) are retried with
    backoff — a blip must NOT kill a long render that is still running fine on the pod.
    """
    start = time.monotonic()
    consecutive_failures = 0
    while True:
        if time.monotonic() - start > timeout:
            raise TimeoutError(
                f"ComfyUI job {prompt_id} did not finish within {timeout:.0f}s "
                f"(pod {pod_url})."
            )
        try:
            h = httpx.get(f"{_base(pod_url)}/history/{prompt_id}", timeout=30).json()
            consecutive_failures = 0
        except (httpx.TransportError, ValueError) as e:
            consecutive_failures += 1
            if consecutive_failures >= 20:  # ~sustained outage, not a blip
                raise RuntimeError(
                    f"Lost contact with pod {pod_url} while polling job {prompt_id} "
                    f"({consecutive_failures} consecutive failures; last: {e}). "
                    f"The job may still be running on the pod — check /history/{prompt_id}."
                ) from None
            time.sleep(min(30.0, interval * consecutive_failures))
            continue
        entry = h.get(prompt_id)
        if entry is not None:
            status = entry.get("status") or {}
            if status.get("status_str") == "error":
                raise RuntimeError(
                    f"ComfyUI job {prompt_id} failed: {json.dumps(status)[:800]}"
                )
            if entry.get("outputs"):
                return entry
        time.sleep(interval)


def find_output_file(history_entry: dict) -> dict | None:
    """Locate the produced file in a history entry's outputs.

    Returns the first file descriptor ({filename, subfolder, type, ...}) found, preferring video
    keys over images. Returns None if nothing matches. Public so it can be unit-tested offline.
    """
    outputs = history_entry.get("outputs", {}) or {}
    # First pass: known keys in preference order.
    for key in _OUTPUT_KEYS:
        for node_out in outputs.values():
            files = node_out.get(key)
            if files:
                return files[0]
    # Fallback: any list-of-dicts that looks like file descriptors.
    for node_out in outputs.values():
        for val in node_out.values():
            if isinstance(val, list) and val and isinstance(val[0], dict) and "filename" in val[0]:
                return val[0]
    return None


def download_output(pod_url: str, history_entry: dict, out_path: str | None = None) -> str:
    """Download the output file referenced by a finished history entry. Returns the saved path."""
    f = find_output_file(history_entry)
    if not f:
        raise RuntimeError(
            "No output file found in the ComfyUI history entry. Outputs: "
            + json.dumps(history_entry.get("outputs", {}))[:800]
        )
    params = {
        "filename": f["filename"],
        "subfolder": f.get("subfolder", ""),
        "type": f.get("type", "output"),
    }
    try:
        r = httpx.get(f"{_base(pod_url)}/view", params=params, timeout=300)
        r.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise _surface_http_error(e, "ComfyUI /view") from None
    out_path = out_path or f["filename"]
    with open(out_path, "wb") as fh:
        fh.write(r.content)
    return out_path


def inject_inputs(workflow_json: dict, inputs: dict, mapping: dict) -> dict:
    """Return a copy of the workflow with per-job `inputs` written into mapped node fields.

    `mapping` ties each logical input to a node + field in the exported graph, e.g.:
        mapping = {"prompt": ("6", "text"), "seed": ("3", "seed")}
        inputs  = {"prompt": "a sunlit kitchen", "seed": 42}
    The concrete mapping for each pipeline's JSON is recorded in workflows/README.md and filled in
    when that workflow is exported. Inputs whose value is None are skipped.
    """
    wf = copy.deepcopy(workflow_json)
    for key, value in inputs.items():
        if value is None:
            continue
        if key not in mapping:
            raise KeyError(
                f"No node mapping for input '{key}'. Known inputs: {list(mapping)}."
            )
        node_id, field = mapping[key]
        if node_id not in wf:
            raise KeyError(
                f"Node id '{node_id}' (mapped from input '{key}') is not in the workflow JSON. "
                f"Check the mapping against the exported graph."
            )
        wf[node_id].setdefault("inputs", {})[field] = value
    return wf


def comfy_generate(
    pod_url: str,
    workflow_json: dict,
    inputs: dict | None = None,
    mapping: dict | None = None,
    out_path: str | None = None,
    timeout: float = DEFAULT_TIMEOUT,
    poll_interval: float = DEFAULT_POLL_INTERVAL,
    on_submit=None,
) -> str:
    """Generate one clip on a ComfyUI pod end to end: inject → submit → poll → download.

    The stable seam the pipeline calls. `inputs` + `mapping` parameterize the saved workflow
    (prompt/seed/etc.); omit them to run the workflow exactly as exported. `on_submit`
    receives the prompt_id right after submission — the cancel path needs it to know
    whether this job is RUNNING on the pod (interrupt) or still QUEUED there (delete).
    """
    wf = inject_inputs(workflow_json, inputs, mapping or {}) if inputs else workflow_json
    prompt_id = submit_prompt(pod_url, wf)
    if on_submit:
        on_submit(prompt_id)
    entry = poll_until_done(pod_url, prompt_id, timeout=timeout, interval=poll_interval)
    return download_output(pod_url, entry, out_path=out_path)


def free_memory(pod_url: str) -> None:
    """Ask ComfyUI to drop cached models from RAM/VRAM (POST /free).

    Engine switches stack models in the container's RAM cache (LTX 29 GB +
    Wan pairs + LongCat) until the pod OOMs — call this before loading a
    different engine's weights. Best-effort: failures are non-fatal."""
    try:
        httpx.post(f"{_base(pod_url)}/free",
                   json={"unload_models": True, "free_memory": True}, timeout=60)
    except httpx.HTTPError:
        pass  # cache stays warm; worst case the render is slower or retries


def upload_file(pod_url: str, file_path: str, overwrite: bool = True,
                remote_name: str | None = None) -> str:
    """Upload a local file (image OR audio) to the pod's input directory.

    ComfyUI's POST /upload/image accepts any file type and drops it into input/ — LoadImage
    and LoadAudio nodes then reference it by the returned name. Returns that pod-side name.
    `remote_name` avoids basename collisions (two different local files both named
    face.jpg would otherwise silently overwrite each other pod-side).
    """
    from pathlib import Path

    p = Path(file_path)
    if not p.exists():
        raise FileNotFoundError(f"upload_file: {file_path} does not exist locally.")
    with open(p, "rb") as fh:
        try:
            r = httpx.post(
                f"{_base(pod_url)}/upload/image",
                files={"image": (remote_name or p.name, fh)},
                data={"overwrite": "true" if overwrite else "false"},
                timeout=300,
            )
            r.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise _surface_http_error(e, "ComfyUI /upload/image") from None
    return r.json().get("name", remote_name or p.name)


def load_workflow(name: str) -> dict:
    """Load an API-format workflow JSON from adgen-backend/workflows/ by name (with or without .json)."""
    from pathlib import Path

    if not name.endswith(".json"):
        name += ".json"
    # app/providers/comfy.py -> parents[2] == adgen-backend/
    path = Path(__file__).resolve().parents[2] / "workflows" / name
    if not path.exists():
        raise FileNotFoundError(
            f"Workflow '{name}' not found at {path}. Export it from ComfyUI "
            f"(dev mode -> Save (API Format)) into adgen-backend/workflows/."
        )
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)
