import pytest
from unittest.mock import MagicMock, patch


class TestListModels:
    def test_delegates_to_client(self):
        with patch("apps.chat.services._client") as mock_client:
            mock_client.list_models.return_value = [
                {"name": "analysis-assistant:latest"}
            ]
            from apps.chat.services import list_models

            result = list_models()
        assert result == [{"name": "analysis-assistant:latest"}]


class TestChat:
    def test_returns_content_string(self):
        with patch("apps.chat.services._client") as mock_client:
            mock_client.chat.return_value = {"message": {"content": "Hello!"}}
            from apps.chat.services import chat

            result = chat([{"role": "user", "content": "hi"}])
        assert result == "Hello!"

    def test_uses_settings_model_when_none_given(self, settings):
        settings.OLLAMA_MODEL = "analysis-assistant"
        with patch("apps.chat.services._client") as mock_client:
            mock_client.chat.return_value = {"message": {"content": "ok"}}
            from apps.chat.services import chat

            chat([{"role": "user", "content": "hi"}])
            call_args = mock_client.chat.call_args
        assert call_args.args[0] == "analysis-assistant"

    def test_uses_explicit_model_when_given(self):
        with patch("apps.chat.services._client") as mock_client:
            mock_client.chat.return_value = {"message": {"content": "ok"}}
            from apps.chat.services import chat

            chat([{"role": "user", "content": "hi"}], model="qwen2.5:3b")
        assert mock_client.chat.call_args.args[0] == "qwen2.5:3b"


class TestStreamChat:
    def test_yields_tokens_and_stops_on_done(self):
        chunks = [
            {"message": {"content": "He"}, "done": False},
            {"message": {"content": "llo"}, "done": False},
            {"message": {"content": ""}, "done": True},
        ]
        with patch("apps.chat.services._client") as mock_client:
            mock_client.chat_stream.return_value = iter(chunks)
            from apps.chat.services import stream_chat

            tokens = list(stream_chat([{"role": "user", "content": "hi"}]))
        assert tokens == ["He", "llo"]

    def test_skips_empty_token_chunks(self):
        chunks = [
            {"message": {"content": "Hi"}, "done": False},
            {"message": {"content": ""}, "done": False},
            {"message": {}, "done": True},
        ]
        with patch("apps.chat.services._client") as mock_client:
            mock_client.chat_stream.return_value = iter(chunks)
            from apps.chat.services import stream_chat

            tokens = list(stream_chat([{"role": "user", "content": "hi"}]))
        assert tokens == ["Hi"]
