from django.conf import settings

from .client import OllamaClient

_client = OllamaClient()


def list_models() -> list[dict]:
    return _client.list_models()


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
