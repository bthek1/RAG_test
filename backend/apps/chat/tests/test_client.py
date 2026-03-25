import json

import pytest
from unittest.mock import MagicMock, patch

from apps.chat.client import OllamaClient


@pytest.fixture
def client():
    return OllamaClient()


class TestListModels:
    def test_returns_model_list(self, client):
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "models": [{"name": "analysis-assistant:latest"}]
        }
        with patch("apps.chat.client.httpx.Client") as MockClient:
            MockClient.return_value.__enter__.return_value.get.return_value = (
                mock_response
            )
            result = client.list_models()
        assert result[0]["name"] == "analysis-assistant:latest"

    def test_raises_on_http_error(self, client):
        import httpx

        with patch("apps.chat.client.httpx.Client") as MockClient:
            mock_http_client = MockClient.return_value.__enter__.return_value
            mock_http_client.get.return_value.raise_for_status.side_effect = (
                httpx.HTTPStatusError(
                    "error", request=MagicMock(), response=MagicMock()
                )
            )
            with pytest.raises(httpx.HTTPStatusError):
                client.list_models()


class TestChat:
    def test_posts_correct_payload(self, client):
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "message": {"role": "assistant", "content": "Hello!"}
        }
        with patch("apps.chat.client.httpx.Client") as MockClient:
            mock_http_client = MockClient.return_value.__enter__.return_value
            mock_http_client.post.return_value = mock_response
            result = client.chat(
                "analysis-assistant", [{"role": "user", "content": "Hi"}]
            )

        mock_http_client.post.assert_called_once()
        call_kwargs = mock_http_client.post.call_args
        assert call_kwargs.kwargs["json"]["model"] == "analysis-assistant"
        assert call_kwargs.kwargs["json"]["stream"] is False
        assert result["message"]["content"] == "Hello!"


class TestGetRunningModels:
    def test_returns_running_model_list(self, client):
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "models": [{"name": "analysis-assistant:latest", "size_vram": 4294967296}]
        }
        with patch("apps.chat.client.httpx.Client") as MockClient:
            MockClient.return_value.__enter__.return_value.get.return_value = (
                mock_response
            )
            result = client.get_running_models()
        assert result[0]["name"] == "analysis-assistant:latest"
        assert result[0]["size_vram"] == 4294967296

    def test_returns_empty_list_when_none_running(self, client):
        mock_response = MagicMock()
        mock_response.json.return_value = {"models": []}
        with patch("apps.chat.client.httpx.Client") as MockClient:
            MockClient.return_value.__enter__.return_value.get.return_value = (
                mock_response
            )
            result = client.get_running_models()
        assert result == []

    def test_raises_on_http_error(self, client):
        import httpx

        with patch("apps.chat.client.httpx.Client") as MockClient:
            mock_http_client = MockClient.return_value.__enter__.return_value
            mock_http_client.get.return_value.raise_for_status.side_effect = (
                httpx.HTTPStatusError(
                    "error", request=MagicMock(), response=MagicMock()
                )
            )
            with pytest.raises(httpx.HTTPStatusError):
                client.get_running_models()


class TestChatStream:
    def test_yields_parsed_chunks(self, client):
        lines = [
            json.dumps({"message": {"content": "He"}, "done": False}),
            json.dumps({"message": {"content": "llo"}, "done": False}),
            json.dumps({"message": {"content": ""}, "done": True}),
        ]
        with patch("apps.chat.client.httpx.Client") as MockClient:
            mock_http_client = MockClient.return_value.__enter__.return_value
            mock_stream = MagicMock()
            mock_stream.__enter__ = MagicMock(return_value=mock_stream)
            mock_stream.__exit__ = MagicMock(return_value=False)
            mock_stream.iter_lines.return_value = iter(lines)
            mock_http_client.stream.return_value = mock_stream
            chunks = list(client.chat_stream("analysis-assistant", []))

        assert len(chunks) == 3
        assert chunks[0]["message"]["content"] == "He"
        assert chunks[2]["done"] is True

    def test_skips_empty_lines(self, client):
        lines = [
            "",
            json.dumps({"message": {"content": "Hi"}, "done": False}),
            "   ",
        ]
        with patch("apps.chat.client.httpx.Client") as MockClient:
            mock_http_client = MockClient.return_value.__enter__.return_value
            mock_stream = MagicMock()
            mock_stream.__enter__ = MagicMock(return_value=mock_stream)
            mock_stream.__exit__ = MagicMock(return_value=False)
            mock_stream.iter_lines.return_value = iter(lines)
            mock_http_client.stream.return_value = mock_stream
            chunks = list(client.chat_stream("analysis-assistant", []))

        assert len(chunks) == 1
