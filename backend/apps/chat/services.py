import logging

from django.conf import settings

from .client import OllamaClient

log = logging.getLogger(__name__)

_client = OllamaClient()


def list_models() -> list[dict]:
    return _client.list_models()


def get_ollama_status() -> dict:
    """Return connectivity + model info for the Ollama status indicator."""
    try:
        models = _client.list_models()
        running_models = _client.get_running_models()
        return {
            "connected": True,
            "base_url": settings.OLLAMA_BASE_URL,
            "models": models,
            "running_models": running_models,
        }
    except Exception as exc:
        log.debug("Ollama unreachable: %s", exc)
        return {
            "connected": False,
            "base_url": settings.OLLAMA_BASE_URL,
            "models": [],
            "running_models": [],
        }


def chat(messages: list[dict], model: str | None = None) -> str:
    model = model or settings.OLLAMA_MODEL
    response = _client.chat(model, messages)
    return response["message"]["content"]


def stream_chat(messages: list[dict], model: str | None = None):
    """Yields text tokens for SSE delivery."""
    model = model or settings.OLLAMA_MODEL
    for chunk in _client.chat_stream(model, messages):
        token = chunk.get("message", {}).get("content", "")
        if token:
            yield token
