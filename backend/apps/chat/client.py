import json

import httpx
from django.conf import settings


class OllamaClient:
    """Minimal synchronous httpx client for the Ollama REST API."""

    def __init__(self) -> None:
        self.base_url = settings.OLLAMA_BASE_URL
        self.timeout = settings.OLLAMA_TIMEOUT

    def list_models(self) -> list[dict]:
        with httpx.Client(timeout=10) as client:
            response = client.get(f"{self.base_url}/api/tags")
            response.raise_for_status()
            return response.json().get("models", [])

    def chat(self, model: str, messages: list[dict]) -> dict:
        payload = {"model": model, "messages": messages, "stream": False}
        with httpx.Client(timeout=self.timeout) as client:
            response = client.post(f"{self.base_url}/api/chat", json=payload)
            response.raise_for_status()
            return response.json()

    def chat_stream(self, model: str, messages: list[dict]):
        """Yields raw response dicts, one per NDJSON line."""
        payload = {"model": model, "messages": messages, "stream": True}
        with httpx.Client(timeout=self.timeout) as client:
            with client.stream(
                "POST", f"{self.base_url}/api/chat", json=payload
            ) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if line.strip():
                        yield json.loads(line)
