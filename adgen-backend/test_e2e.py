"""Chunk 5 E2E test: POST /generate (mode=overlay) with the user's two café shots.

Prompts below are the USER'S OWN (Wan 2.2 structure: positive + negative per shot) — verbatim.

Usage (server must be running first):
    ./.venv/bin/uvicorn app.main:app --port 8000        # terminal 1
    ./.venv/bin/python test_e2e.py                      # terminal 2

Expect ~20+ min per clip at QUALITY settings; the script polls and prints progress.
"""
import sys
import time

import httpx

BASE = "http://127.0.0.1:8000"

# 🔴 NARRATION SCRIPT: set by the user (None = silent stitch, no overlay).
SCRIPT = None
LANGUAGE = "hi"

SHOTS = [
    {
        "prompt": (
            "A warm modern café during golden hour, sunlight streaming through large "
            "floor-to-ceiling windows, creating soft natural highlights across wooden tables "
            "and indoor plants. Four young adults in their mid-twenties sit together around a "
            "wooden table, engaged in a relaxed conversation. A woman wearing a cream-colored "
            "sweater smiles warmly while speaking, naturally gesturing with one hand. A man in "
            "a navy-blue shirt listens attentively, nodding occasionally before smiling. "
            "Another woman wearing a light green jacket gently stirs a cup of coffee while "
            "maintaining eye contact with the group. A man wearing a dark brown jacket leans "
            "slightly forward, resting one arm on the table while listening with genuine "
            "interest.\n\n"
            "The conversation feels natural and unscripted. Small facial expressions change "
            "continuously. Natural blinking, subtle eyebrow movement, realistic eye contact, "
            "gentle breathing, relaxed posture shifts, authentic finger movements, realistic "
            "clothing folds, and spontaneous smiles create believable human interaction. Steam "
            "slowly rises from ceramic coffee cups. Sunlight reflects softly on glass windows "
            "and polished wooden surfaces.\n\n"
            "The café background contains blurred customers, bookshelves, hanging pendant "
            "lights, indoor plants, pastries behind a display counter, and warm decorative "
            "lighting. The atmosphere is calm, welcoming, lively, and authentic.\n\n"
            "Camera positioned at seated eye level in a medium-wide cinematic shot. The camera "
            "performs a very slow dolly push-in toward the group while gently drifting "
            "slightly to the left. Smooth handheld micro-movements. Natural depth compression. "
            "Soft rack focus between the current speaker and the listeners. Shallow depth of "
            "field. Soft cinematic bokeh.\n\n"
            "Ultra-photorealistic. Documentary-style cinematography. Natural skin texture. "
            "Physically accurate lighting. Professional color grading. Kodak Vision3 35mm film "
            "look. High dynamic range. Smooth realistic motion. Temporal consistency. "
            "Professional cinema quality."
        ),
        "negative_prompt": (
            "cartoon, anime, CGI, 3D render, plastic skin, waxy skin, doll face, deformed "
            "hands, bad anatomy, extra fingers, extra limbs, cloned faces, identity drift, "
            "face morphing, robotic movement, synchronized movement, frozen expressions, "
            "jerky motion, flickering, temporal inconsistency, unstable camera, oversaturated "
            "colors, harsh shadows, watermark, logo, subtitles, blurry, low quality"
        ),
    },
    {
        "prompt": (
            "The same four young adults continue their conversation in the same warm modern "
            "café during golden hour. The camera naturally continues its slow movement from "
            "the previous shot without interruption. The woman in the cream-colored sweater "
            "finishes speaking and smiles while lowering her hand back onto the wooden table. "
            "The man in the navy-blue shirt begins responding with a relaxed smile, making a "
            "small hand gesture as he talks. The woman in the light green jacket softly "
            "laughs, lifting her ceramic coffee mug for a small sip before placing it gently "
            "back on the table. The man in the dark brown jacket nods naturally and briefly "
            "glances toward the speaker before smiling back at the group.\n\n"
            "The group exchanges natural eye contact throughout the conversation. Facial "
            "expressions evolve smoothly with genuine laughter, subtle smiles, realistic "
            "blinking, breathing, small head turns, natural posture adjustments, relaxed "
            "shoulder movement, authentic finger articulation, and soft clothing movement. "
            "Steam continues rising gently from coffee cups. Sunlight slowly shifts across "
            "the wooden tabletop while reflections move naturally across the glass windows.\n\n"
            "The softly blurred café background remains consistent, with customers casually "
            "walking in the distance, warm hanging lights glowing gently, bookshelves, indoor "
            "plants, and a pastry counter creating a cozy atmosphere. The environment feels "
            "alive but never distracts from the conversation.\n\n"
            "Camera remains at seated eye level, continuing the same slow cinematic dolly "
            "movement while gradually orbiting slightly around the table. Smooth handheld "
            "micro-movements. Focus naturally transitions between the speaker and listeners. "
            "Realistic motion blur. Shallow depth of field. Cinematic documentary "
            "photography.\n\n"
            "Ultra-photorealistic. Natural human interaction. Documentary-style "
            "cinematography. Physically accurate lighting. Kodak Vision3 35mm film look. "
            "High dynamic range. Professional cinema quality. Temporal consistency. Smooth "
            "realistic motion."
        ),
        "negative_prompt": (
            "cartoon, anime, CGI, plastic skin, waxy skin, doll face, deformed hands, extra "
            "fingers, bad anatomy, cloned people, identity drift, face morphing, robotic "
            "movement, frozen expressions, unnatural eye movement, jerky motion, flickering, "
            "unstable camera, overexposed highlights, oversaturated colors, blurry, "
            "watermark, logo, text, subtitles, low quality"
        ),
    },
]


def main() -> None:
    r = httpx.get(f"{BASE}/health", timeout=10)
    r.raise_for_status()
    print("server: healthy")

    body = {"mode": "overlay", "shots": SHOTS, "script": SCRIPT, "language": LANGUAGE}
    r = httpx.post(f"{BASE}/generate", json=body, timeout=30)
    r.raise_for_status()
    job_id = r.json()["job_id"]
    print(f"job started: {job_id}")

    start = time.monotonic()
    while True:
        time.sleep(15)
        j = httpx.get(f"{BASE}/jobs/{job_id}", timeout=10).json()
        elapsed = int(time.monotonic() - start)
        print(f"  [{elapsed:>5}s] {j['status']:<11} {j['progress']:>3}%  {j.get('detail', '')}")
        if j["status"] == "done":
            print(f"\nDONE: video at {j['video_path']}")
            print(f"or download: {BASE}/jobs/{job_id}/video")
            break
        if j["status"] == "error":
            print(f"\nERROR: {j['error']}")
            sys.exit(1)


if __name__ == "__main__":
    main()
