from __future__ import annotations

import asyncio
import hashlib
import hmac
import io
import os
import subprocess
from collections import OrderedDict
from contextlib import asynccontextmanager

import numpy as np
import soundfile as sf
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse, Response
from kokoro import KPipeline
from pydantic import BaseModel, Field

SAMPLE_RATE = 24_000
SUPPORTED_VOICES = {"pf_dora", "pm_alex", "pm_santa"}
SUPPORTED_FORMATS = {"opus", "ogg", "mp3", "wav"}
DEFAULT_VOICE = os.getenv("VOICE_DEFAULT", "pf_dora").strip().lower() or "pf_dora"
MAX_CHARS = max(200, min(3_000, int(os.getenv("VOICE_MAX_CHARS", "1800"))))
CACHE_SIZE = max(0, min(50, int(os.getenv("VOICE_CACHE_ITEMS", "16"))))
CONCURRENCY = max(1, min(2, int(os.getenv("VOICE_MAX_CONCURRENCY", "1"))))

_pipeline: KPipeline | None = None
_pipeline_lock = asyncio.Lock()
_generation_gate = asyncio.Semaphore(CONCURRENCY)
_cache: OrderedDict[str, tuple[bytes, str, str]] = OrderedDict()
_cache_lock = asyncio.Lock()


class SpeechRequest(BaseModel):
    model: str | None = None
    input: str = Field(min_length=1, max_length=3_000)
    voice: str = DEFAULT_VOICE
    response_format: str = "opus"
    speed: float = Field(default=0.96, ge=0.70, le=1.30)
    language: str | None = "pt-BR"
    instructions: str | None = None


def _enabled(value: str | None, default: bool = False) -> bool:
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "sim", "on", "enabled", "ativo"}


def _authorize(authorization: str | None) -> None:
    expected = os.getenv("VOICE_API_KEY", "").strip()
    if not expected:
        return
    received = (authorization or "").removeprefix("Bearer ").strip()
    if not received or not hmac.compare_digest(received, expected):
        raise HTTPException(status_code=401, detail="Serviço de voz não autorizado.")


def _normalized_text(value: str) -> str:
    return " ".join(str(value or "").replace("\x00", " ").split()).strip()[:MAX_CHARS]


async def _get_pipeline() -> KPipeline:
    global _pipeline
    if _pipeline is not None:
        return _pipeline
    async with _pipeline_lock:
        if _pipeline is None:
            _pipeline = await asyncio.to_thread(KPipeline, lang_code="p")
    return _pipeline


def _generate_wav(pipeline: KPipeline, text: str, voice: str, speed: float) -> bytes:
    chunks: list[np.ndarray] = []
    for _graphemes, _phonemes, audio in pipeline(text, voice=voice, speed=speed):
        array = np.asarray(audio, dtype=np.float32).reshape(-1)
        if array.size:
            chunks.append(array)
    if not chunks:
        raise RuntimeError("O motor de voz não gerou áudio.")
    merged = np.concatenate(chunks)
    stream = io.BytesIO()
    sf.write(stream, merged, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    return stream.getvalue()


def _transcode(wav: bytes, output_format: str) -> tuple[bytes, str, str]:
    fmt = output_format.lower()
    if fmt == "wav":
        return wav, "audio/wav", "resposta.wav"
    if fmt == "mp3":
        command = [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
            "-vn", "-codec:a", "libmp3lame", "-b:a", "96k", "-f", "mp3", "pipe:1",
        ]
        content_type, filename = "audio/mpeg", "resposta.mp3"
    else:
        command = [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
            "-vn", "-codec:a", "libopus", "-application", "voip", "-b:a", "48k",
            "-vbr", "on", "-ar", "48000", "-f", "ogg", "pipe:1",
        ]
        content_type, filename = "audio/ogg", "resposta.ogg"
    result = subprocess.run(command, input=wav, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if result.returncode != 0 or not result.stdout:
        error = result.stderr.decode("utf-8", errors="replace")[-500:]
        raise RuntimeError(f"Falha ao converter o áudio: {error or 'saída vazia'}")
    return result.stdout, content_type, filename


async def _cache_get(key: str) -> tuple[bytes, str, str] | None:
    if CACHE_SIZE <= 0:
        return None
    async with _cache_lock:
        item = _cache.get(key)
        if item:
            _cache.move_to_end(key)
        return item


async def _cache_put(key: str, item: tuple[bytes, str, str]) -> None:
    if CACHE_SIZE <= 0:
        return
    async with _cache_lock:
        _cache[key] = item
        _cache.move_to_end(key)
        while len(_cache) > CACHE_SIZE:
            _cache.popitem(last=False)


async def _warmup() -> None:
    try:
        await _get_pipeline()
        print("[vitoria-regia-voice] Kokoro pt-BR carregado.", flush=True)
    except Exception as error:
        print(f"[vitoria-regia-voice] Aquecimento adiado: {error}", flush=True)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if _enabled(os.getenv("VOICE_WARMUP_ON_START"), True):
        asyncio.create_task(_warmup())
    yield


app = FastAPI(
    title="Vitória Régia Voice",
    version="1.0.0",
    description="TTS gratuito em português brasileiro com Kokoro-82M.",
    lifespan=lifespan,
)


@app.get("/")
async def root() -> dict[str, object]:
    return {
        "ok": True,
        "service": "Vitória Régia Voice",
        "provider": "Kokoro-82M",
        "language": "pt-BR",
        "voices": sorted(SUPPORTED_VOICES),
        "formats": ["opus", "mp3", "wav"],
    }


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "ok": True,
        "ready": _pipeline is not None,
        "provider": "kokoro",
        "voice": DEFAULT_VOICE if DEFAULT_VOICE in SUPPORTED_VOICES else "pf_dora",
        "protected": bool(os.getenv("VOICE_API_KEY", "").strip()),
    }


@app.post("/warmup")
async def warmup(authorization: str | None = Header(default=None)) -> dict[str, object]:
    _authorize(authorization)
    await _get_pipeline()
    return {"ok": True, "ready": True, "provider": "kokoro"}


@app.post("/v1/audio/speech")
async def speech(payload: SpeechRequest, authorization: str | None = Header(default=None)) -> Response:
    _authorize(authorization)
    text = _normalized_text(payload.input)
    if not text:
        raise HTTPException(status_code=400, detail="Texto vazio para gerar áudio.")
    requested_voice = payload.voice.strip().lower()
    voice = requested_voice if requested_voice in SUPPORTED_VOICES else (DEFAULT_VOICE if DEFAULT_VOICE in SUPPORTED_VOICES else "pf_dora")
    output_format = payload.response_format.strip().lower()
    if output_format not in SUPPORTED_FORMATS:
        raise HTTPException(status_code=400, detail="Formato inválido. Use opus, mp3 ou wav.")
    if output_format == "ogg":
        output_format = "opus"

    cache_key = hashlib.sha256(f"{voice}|{payload.speed:.3f}|{output_format}|{text}".encode("utf-8")).hexdigest()
    cached = await _cache_get(cache_key)
    if cached is not None:
        audio, content_type, filename = cached
        return Response(audio, media_type=content_type, headers={"Content-Disposition": f'inline; filename="{filename}"', "X-Voice-Cache": "HIT", "X-Voice-Name": voice})

    try:
        async with _generation_gate:
            pipeline = await _get_pipeline()
            wav = await asyncio.to_thread(_generate_wav, pipeline, text, voice, float(payload.speed))
            audio, content_type, filename = await asyncio.to_thread(_transcode, wav, output_format)
    except Exception as error:
        return JSONResponse(status_code=503, content={"ok": False, "error": "Não foi possível gerar a voz agora.", "detail": str(error)[:500]})

    result = (audio, content_type, filename)
    await _cache_put(cache_key, result)
    return Response(
        audio,
        media_type=content_type,
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Voice-Provider": "kokoro",
            "X-Voice-Name": voice,
            "X-Voice-Requested": requested_voice,
            "X-Voice-Cache": "MISS",
        },
    )
