"""Chunk 1 test: prove ElevenLabs synthesize_voice() returns good Hindi + English audio.

Run from the adgen-backend/ directory:
    python test_tts.py

Requires ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in adgen-backend/.env
(see adgen-platform/mdfiles/14-SECRETS-I-NEED-FROM-YOU.md).
"""
import os

from app.providers.tts import synthesize_voice

# (language, output filename, script) — all audio lives flat in outputs/audio/
SAMPLES = [
    (
        "hi",
        "outputs/audio/hindi-sample.mp3",
        "दिल्ली पब्लिक स्कूल सुशांत लोक में, एप्पल ब्लॉसम के सहयोग से एक नई शुरुआत।",
    ),
    (
        "en",
        "outputs/audio/english-sample.mp3",
        "Introducing the all-new Apple Blossom — crafted for the moments that matter.",
    ),
]


def main() -> None:
    os.makedirs("outputs/audio", exist_ok=True)
    for language, out, script in SAMPLES:
        path = synthesize_voice(script, language=language, output_path=out)
        size = os.path.getsize(path)
        print(f"[{language}] wrote: {path}  ({size:,} bytes)")
    print("\nDone. Play the files back to confirm voice quality.")


if __name__ == "__main__":
    main()
