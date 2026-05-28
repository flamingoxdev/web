"""
Unified chat-completion client.

Provider is chosen by LLM_PROVIDER env var:
  - "nvidia": NVIDIA's OpenAI-compatible endpoint (cloud, fast)
  - "ollama": local Ollama via /api/chat (slower, offline)

Public API: `chat(prompt, *, system=None, json_mode=True, timeout=60) -> str`
Returns the raw assistant text. Callers handle JSON parsing.
"""

import os
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

def _provider() -> str:
    return (os.getenv("LLM_PROVIDER") or "nvidia").lower()

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
NVIDIA_BASE_URL = os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
NVIDIA_MODEL = os.getenv("NVIDIA_MODEL", "meta/llama-3.3-70b-instruct")

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")


_nvidia_client = None


def _get_nvidia_client():
    global _nvidia_client
    if _nvidia_client is not None:
        return _nvidia_client
    try:
        from openai import OpenAI
    except ImportError as e:
        raise RuntimeError(
            "openai package not installed. Run: pip install openai"
        ) from e
    if not NVIDIA_API_KEY:
        raise RuntimeError("NVIDIA_API_KEY not set. Add it to your .env file.")
    _nvidia_client = OpenAI(api_key=NVIDIA_API_KEY, base_url=NVIDIA_BASE_URL)
    return _nvidia_client


def _chat_nvidia(prompt: str, *, system: str | None, json_mode: bool, timeout: int) -> str:
    client = _get_nvidia_client()
    model = os.getenv("NVIDIA_MODEL", NVIDIA_MODEL)
    max_tokens = int(os.getenv("LLM_MAX_TOKENS", "700"))
    temperature = float(os.getenv("LLM_TEMPERATURE", "0.1"))
    top_p = float(os.getenv("LLM_TOP_P", "0.7"))
    messages: list[dict] = []
    if system:
        messages.append({"role": "system", "content": system})
    if json_mode:
        # The base "system" message already accepts JSON instructions; for safety
        # we also tell the user-side prompt to return JSON. Most NVIDIA-hosted
        # OpenAI-compatible models do not support response_format yet, so we
        # instruct rather than constrain.
        prompt = (
            prompt
            + "\n\nIMPORTANT: respond with ONLY a valid JSON object. "
            "No markdown, no preamble, no trailing prose."
        )
    messages.append({"role": "user", "content": prompt})

    resp = client.chat.completions.create(
        model=model,
        messages=messages,  # type: ignore[arg-type]
        temperature=temperature,
        top_p=top_p,
        max_tokens=max_tokens,
        stream=False,
        timeout=timeout,
    )
    content = resp.choices[0].message.content or ""
    return content.strip()


def _chat_ollama(prompt: str, *, system: str | None, json_mode: bool, timeout: int) -> str:
    import httpx

    messages: list[dict] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    payload: dict = {"model": OLLAMA_MODEL, "messages": messages, "stream": False}
    if json_mode:
        payload["format"] = "json"
    r = httpx.post(f"{OLLAMA_URL}/api/chat", json=payload, timeout=timeout)
    r.raise_for_status()
    return r.json()["message"]["content"].strip()


def chat(prompt: str, *, system: str | None = None, json_mode: bool = True, timeout: int = 60) -> str:
    if _provider() == "nvidia":
        return _chat_nvidia(prompt, system=system, json_mode=json_mode, timeout=timeout)
    return _chat_ollama(prompt, system=system, json_mode=json_mode, timeout=timeout)


def provider_info() -> dict:
    if _provider() == "nvidia":
        return {"provider": "nvidia", "model": os.getenv("NVIDIA_MODEL", NVIDIA_MODEL), "configured": bool(NVIDIA_API_KEY)}
    return {"provider": "ollama", "model": OLLAMA_MODEL, "configured": True}


# ── async wrapper for use inside FastAPI endpoints / agent loops ──────────

async def achat(prompt: str, *, system: str | None = None, json_mode: bool = True, timeout: int = 60) -> str:
    """Async wrapper: runs the sync chat call in a thread to keep the loop free."""
    import asyncio
    return await asyncio.to_thread(chat, prompt, system=system, json_mode=json_mode, timeout=timeout)


# Convenience: parse JSON from any provider's output, tolerant of fences.
def extract_json(raw: str) -> dict:
    import re
    fence_re = re.compile(r"```(?:json|JSON)?\s*|\s*```", re.MULTILINE)
    if not raw or not raw.strip():
        raise ValueError("LLM returned empty response")
    for candidate in (
        raw.strip(),
        fence_re.sub("", raw).strip(),
        raw[raw.find("{") : raw.rfind("}") + 1] if "{" in raw and "}" in raw else "",
    ):
        if not candidate:
            continue
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue
    raise ValueError(f"Could not parse JSON from LLM output. First 200 chars: {raw[:200]!r}")
