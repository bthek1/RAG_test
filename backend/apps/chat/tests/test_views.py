import pytest
from unittest.mock import patch


@pytest.mark.django_db
class TestOllamaStatusView:
    def test_returns_connected_status(self, authenticated_client):
        status = {
            "connected": True,
            "base_url": "http://localhost:11434",
            "models": [{"name": "analysis-assistant:latest"}],
            "running_models": [],
        }
        with patch("apps.chat.views.get_ollama_status", return_value=status):
            response = authenticated_client.get("/api/chat/status/")
        assert response.status_code == 200
        assert response.data["connected"] is True
        assert len(response.data["models"]) == 1
        assert response.data["base_url"] == "http://localhost:11434"

    def test_returns_disconnected_status(self, authenticated_client):
        status = {
            "connected": False,
            "base_url": "http://localhost:11434",
            "models": [],
            "running_models": [],
        }
        with patch("apps.chat.views.get_ollama_status", return_value=status):
            response = authenticated_client.get("/api/chat/status/")
        assert response.status_code == 200
        assert response.data["connected"] is False
        assert response.data["models"] == []

    def test_requires_authentication(self, api_client):
        response = api_client.get("/api/chat/status/")
        assert response.status_code == 401


@pytest.mark.django_db
class TestModelListView:
    def test_returns_model_names(self, authenticated_client):
        models = [{"name": "analysis-assistant:latest"}, {"name": "qwen2.5:3b"}]
        with patch("apps.chat.views.list_models", return_value=models):
            response = authenticated_client.get("/api/chat/models/")
        assert response.status_code == 200
        assert response.data["models"] == models

    def test_requires_authentication(self, api_client):
        response = api_client.get("/api/chat/models/")
        assert response.status_code == 401


@pytest.mark.django_db
class TestChatView:
    def test_returns_reply(self, authenticated_client):
        with patch("apps.chat.views.chat", return_value="Hello from Ollama!"):
            response = authenticated_client.post(
                "/api/chat/",
                {"messages": [{"role": "user", "content": "Hello"}]},
                format="json",
            )
        assert response.status_code == 200
        assert response.data["reply"] == "Hello from Ollama!"

    def test_accepts_explicit_model(self, authenticated_client):
        with patch("apps.chat.views.chat", return_value="ok") as mock_chat:
            authenticated_client.post(
                "/api/chat/",
                {
                    "messages": [{"role": "user", "content": "Hello"}],
                    "model": "qwen2.5:3b",
                },
                format="json",
            )
        mock_chat.assert_called_once_with(
            [{"role": "user", "content": "Hello"}], "qwen2.5:3b"
        )

    def test_rejects_invalid_role(self, authenticated_client):
        response = authenticated_client.post(
            "/api/chat/",
            {"messages": [{"role": "invalid_role", "content": "Hello"}]},
            format="json",
        )
        assert response.status_code == 400

    def test_rejects_empty_messages(self, authenticated_client):
        response = authenticated_client.post(
            "/api/chat/",
            {"messages": []},
            format="json",
        )
        assert response.status_code == 400

    def test_requires_authentication(self, api_client):
        response = api_client.post("/api/chat/", {}, format="json")
        assert response.status_code == 401


@pytest.mark.django_db
class TestChatStreamView:
    def test_returns_event_stream_content_type(self, authenticated_client):
        with patch("apps.chat.views.stream_chat", return_value=iter(["Hello"])):
            response = authenticated_client.post(
                "/api/chat/stream/",
                {"messages": [{"role": "user", "content": "Hello"}]},
                format="json",
            )
        assert "text/event-stream" in response.get("Content-Type", "")

    def test_sse_format_contains_token(self, authenticated_client):
        with patch(
            "apps.chat.views.stream_chat", return_value=iter(["Hello", " world"])
        ):
            response = authenticated_client.post(
                "/api/chat/stream/",
                {"messages": [{"role": "user", "content": "Hello"}]},
                format="json",
            )
        content = b"".join(response.streaming_content).decode()
        assert "Hello" in content
        assert "data: [DONE]" in content

    def test_sets_no_cache_headers(self, authenticated_client):
        with patch("apps.chat.views.stream_chat", return_value=iter([])):
            response = authenticated_client.post(
                "/api/chat/stream/",
                {"messages": [{"role": "user", "content": "Hello"}]},
                format="json",
            )
        assert response.get("Cache-Control") == "no-cache"
        assert response.get("X-Accel-Buffering") == "no"

    def test_requires_authentication(self, api_client):
        response = api_client.post("/api/chat/stream/", {}, format="json")
        assert response.status_code == 401
