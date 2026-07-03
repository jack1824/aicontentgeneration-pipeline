"""Gemini /plan chunk test: rough idea -> 1-3 proposed ad approaches.

Test idea derives from the user's own creatine-ad content (not invented).
Run (server must be up):
    ./.venv/bin/python test_plan.py
Or direct (no server):
    ./.venv/bin/python test_plan.py --direct
"""
import json
import sys

IDEA = (
    "An ad for a creatine monohydrate supplement. Vibe: authentic fitness "
    "YouTuber recommending it — simple, mixes easily, fits a daily routine."
)


def main() -> None:
    if "--direct" in sys.argv:
        from app.providers import llm
        result = llm.plan(IDEA, language="en", ad_format="9:16", duration_s=15)
    else:
        import httpx
        r = httpx.post("http://127.0.0.1:8000/plan",
                       json={"idea": IDEA, "language": "en",
                             "format": "9:16", "duration_s": 15},
                       timeout=180)
        r.raise_for_status()
        result = r.json()

    for i, a in enumerate(result["approaches"], 1):
        print(f"\n=== Approach {i}: {a['title']} ===")
        print(f"pipeline: {a['pipeline']}  (available now: {a.get('available')})")
        print(f"audio:    {a.get('audio_strategy')}")
        print(f"why:      {a.get('why')}")
        print(f"script:   {a.get('narration_script', '')[:200]}")
        for j, s in enumerate(a.get("shots") or [], 1):
            print(f"  shot {j}: {s['prompt'][:140]}...")
        if a.get("needs_from_user"):
            print(f"needs:    {a['needs_from_user']}")
    print(f"\n({len(result['approaches'])} approaches; full JSON below)")
    print(json.dumps(result, indent=2, ensure_ascii=False)[:1500])


if __name__ == "__main__":
    main()
