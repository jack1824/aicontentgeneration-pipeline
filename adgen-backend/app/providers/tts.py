"""ElevenLabs text-to-speech provider.

This is the single, swappable audio seam (golden rule, file 00): the rest of the app only
ever calls `synthesize_voice()`. To move to an open-source TTS later, replace this function's
body and nothing else changes.

Note on output format: the ElevenLabs TTS endpoint returns MP3 (audio/mpeg) by default, so
we name the output file to match the real format (`.mp3`) rather than a misleading `.wav`.
FFmpeg downstream accepts MP3 fine. (True PCM/WAV would use an `output_format=pcm_*` and a
WAV header — not needed for the current pipeline.)
"""
import httpx

from app.config import ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID

ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
DEFAULT_MODEL_ID = "eleven_multilingual_v2"   # Hindi-capable
DEFAULT_OUTPUT_FORMAT = "mp3_44100_128"        # returns MP3


def _extension_for_format(output_format: str) -> str:
    """Pick a file extension that matches the requested ElevenLabs output format."""
    if output_format.startswith("mp3"):
        return "mp3"
    if output_format.startswith("opus"):
        return "opus"
    if output_format.startswith("pcm") or output_format.startswith("ulaw"):
        return "wav"  # raw audio; not used by the current pipeline
    return "mp3"


def synthesize_voice(
    text: str,
    voice_id: str | None = None,
    language: str = "hi",
    output_path: str | None = None,
    output_format: str = DEFAULT_OUTPUT_FORMAT,
    model_id: str = DEFAULT_MODEL_ID,
) -> str:
    """Generate narration with ElevenLabs and return the path to the saved audio file.

    Args:
        text: the script to speak (Hindi or English; eleven_multilingual_v2 auto-detects).
        voice_id: ElevenLabs voice id; falls back to ELEVENLABS_VOICE_ID from the env.
        language: kept for the provider interface. eleven_multilingual_v2 auto-detects the
            language, so this is currently informational; an OSS TTS swap may use it.
        output_path: where to write the file. Defaults to `narration.<ext>` in the current
            directory, where <ext> matches `output_format` (mp3 by default).
        output_format: ElevenLabs output format. Default `mp3_44100_128`.
        model_id: ElevenLabs model. Default `eleven_multilingual_v2` (Hindi-capable).

    Raises:
        RuntimeError: if the API key or voice id is missing (clear, actionable message).
        httpx.HTTPStatusError: if ElevenLabs returns an error (response body is surfaced).
    """
    voice = voice_id or ELEVENLABS_VOICE_ID

    if not ELEVENLABS_API_KEY:
        raise RuntimeError(
            "ELEVENLABS_API_KEY is not set. Add it to adgen-backend/.env "
            "(see adgen-platform/mdfiles/14-SECRETS-I-NEED-FROM-YOU.md)."
        )
    if not voice:
        raise RuntimeError(
            "No voice id provided and ELEVENLABS_VOICE_ID is not set. Add a Hindi-capable "
            "voice id to adgen-backend/.env "
            "(see adgen-platform/mdfiles/14-SECRETS-I-NEED-FROM-YOU.md)."
        )

    url = ELEVENLABS_TTS_URL.format(voice_id=voice)
    headers = {"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"}
    body = {"text": text, "model_id": model_id}
    params = {"output_format": output_format}

    try:
        r = httpx.post(url, headers=headers, params=params, json=body, timeout=120)
        r.raise_for_status()
    except httpx.HTTPStatusError as e:
        # Surface ElevenLabs' error body (bad key / voice / quota) instead of a bare status.
        raise httpx.HTTPStatusError(
            f"ElevenLabs TTS failed ({e.response.status_code}): {e.response.text}",
            request=e.request,
            response=e.response,
        ) from None

    if output_path is None:
        output_path = f"narration.{_extension_for_format(output_format)}"
    with open(output_path, "wb") as f:
        f.write(r.content)
    return output_path
