"""
Speech services — STT and TTS with automatic fallbacks.

Primary:  ElevenLabs (required by event — STT + TTS)
Fallback: Groq Whisper (STT) / Edge-TTS (TTS) / Browser Web Speech API (TTS)

Chain:
  STT: ElevenLabs → Groq Whisper
  TTS: ElevenLabs → Edge-TTS (Microsoft, free, no key) → Browser Web Speech API
"""

from __future__ import annotations

import io
import logging

import edge_tts
import httpx

from app.config import (
    ELEVENLABS_API_KEY,
    ELEVENLABS_STT_URL,
    ELEVENLABS_TTS_URL,
    ELEVENLABS_VOICE_ID,
    GROQ_API_KEY,
)

logger = logging.getLogger(__name__)

# Track whether ElevenLabs is available (skip retries after first block)
_elevenlabs_blocked = False

# Edge-TTS voice — calm, natural male voice (sounds most human-like)
EDGE_TTS_VOICE = "en-US-GuyNeural"


async def transcribe_audio(audio_bytes: bytes, filename: str = "audio.wav") -> str | None:
    """
    Transcribe audio to text. Tries ElevenLabs first, then Groq Whisper.
    """
    global _elevenlabs_blocked

    # Try ElevenLabs STT first (if not known to be blocked)
    if ELEVENLABS_API_KEY and not _elevenlabs_blocked:
        result = await _elevenlabs_stt(audio_bytes, filename)
        if result is not None:
            return result
        # If it failed, it might be blocked — try Groq

    # Fallback: Groq Whisper STT
    if GROQ_API_KEY:
        result = await _groq_whisper_stt(audio_bytes, filename)
        if result is not None:
            return result

    logger.error("All STT providers failed.")
    return None


async def text_to_speech(text: str) -> bytes | None:
    """
    Convert text to speech.
    Chain: ElevenLabs → Edge-TTS (Microsoft, free) → None (browser fallback).
    Returns MP3 audio bytes, or None if all server-side TTS fail.
    """
    global _elevenlabs_blocked

    # 1) Try ElevenLabs (if not blocked)
    if not _elevenlabs_blocked and ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID:
        result = await _elevenlabs_tts(text)
        if result is not None:
            return result

    # 2) Edge-TTS fallback (Microsoft, free, no API key required)
    result = await _edge_tts(text)
    if result is not None:
        return result

    # 3) All server TTS failed — frontend will use browser Web Speech API
    logger.warning("All server-side TTS failed — deferring to browser TTS.")
    return None


async def _elevenlabs_tts(text: str) -> bytes | None:
    """ElevenLabs TTS — high quality but may be blocked on free tier."""
    global _elevenlabs_blocked

    tts_url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"

    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
    }

    payload = {
        "text": text,
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(tts_url, headers=headers, json=payload)
            resp.raise_for_status()
            audio_bytes = resp.content
            logger.info("ElevenLabs TTS successful (%d bytes).", len(audio_bytes))
            return audio_bytes

    except httpx.HTTPStatusError as exc:
        body = exc.response.text
        if "unusual_activity" in body or exc.response.status_code == 401:
            _elevenlabs_blocked = True
            logger.warning("ElevenLabs blocked — switching to Edge-TTS.")
        else:
            logger.error("ElevenLabs TTS HTTP error %s: %s", exc.response.status_code, body)
    except httpx.RequestError as exc:
        logger.error("ElevenLabs TTS request error: %s", exc)

    return None


async def _edge_tts(text: str) -> bytes | None:
    """Microsoft Edge TTS — free, no API key, high quality neural voices."""
    try:
        communicate = edge_tts.Communicate(text, EDGE_TTS_VOICE)
        buffer = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buffer.write(chunk["data"])
        audio_bytes = buffer.getvalue()
        if audio_bytes:
            logger.info("Edge-TTS successful (%d bytes).", len(audio_bytes))
            return audio_bytes
        return None
    except Exception as exc:
        logger.error("Edge-TTS error: %s", exc)
        return None


# ── ElevenLabs STT ───────────────────────────────────────────

async def _elevenlabs_stt(audio_bytes: bytes, filename: str) -> str | None:
    """ElevenLabs Speech-to-Text."""
    global _elevenlabs_blocked

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "wav"
    mime_map = {
        "wav": "audio/wav", "mp3": "audio/mpeg", "webm": "audio/webm",
        "ogg": "audio/ogg", "oga": "audio/ogg", "opus": "audio/ogg",
        "m4a": "audio/mp4", "flac": "audio/flac",
    }
    mime_type = mime_map.get(ext, "audio/ogg")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                ELEVENLABS_STT_URL,
                headers={"xi-api-key": ELEVENLABS_API_KEY},
                files={"file": (filename, audio_bytes, mime_type)},
                data={"model_id": "scribe_v1"},
            )
            resp.raise_for_status()
            transcript = resp.json().get("text", "")
            if transcript:
                logger.info("ElevenLabs STT successful (%d chars).", len(transcript))
                return transcript
            return None

    except httpx.HTTPStatusError as exc:
        body = exc.response.text
        if "unusual_activity" in body or exc.response.status_code == 401:
            _elevenlabs_blocked = True
            logger.warning("ElevenLabs STT blocked — falling back to Groq Whisper.")
        else:
            logger.error("ElevenLabs STT HTTP %s: %s", exc.response.status_code, body)
    except httpx.RequestError as exc:
        logger.error("ElevenLabs STT request error: %s", exc)
    return None


# ── Groq Whisper STT (free fallback) ────────────────────────

GROQ_STT_URL = "https://api.groq.com/openai/v1/audio/transcriptions"

async def _groq_whisper_stt(audio_bytes: bytes, filename: str) -> str | None:
    """Groq Whisper STT — free, fast, no restrictions."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "wav"
    mime_map = {
        "wav": "audio/wav", "mp3": "audio/mpeg", "webm": "audio/webm",
        "ogg": "audio/ogg", "oga": "audio/ogg", "opus": "audio/ogg",
        "m4a": "audio/mp4", "flac": "audio/flac",
    }
    mime_type = mime_map.get(ext, "audio/ogg")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                GROQ_STT_URL,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                files={"file": (filename, audio_bytes, mime_type)},
                data={
                    "model": "whisper-large-v3-turbo",
                    "response_format": "json",
                    "language": "en",
                },
            )
            resp.raise_for_status()
            result = resp.json()
            transcript = result.get("text", "")
            if transcript:
                logger.info("Groq Whisper STT successful (%d chars).", len(transcript))
                return transcript
            return None

    except httpx.HTTPStatusError as exc:
        logger.error("Groq Whisper STT HTTP %s: %s", exc.response.status_code, exc.response.text)
    except httpx.RequestError as exc:
        logger.error("Groq Whisper STT request error: %s", exc)
    return None
