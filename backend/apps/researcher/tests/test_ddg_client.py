from unittest.mock import MagicMock, patch

import pytest

from apps.researcher.ddg_client import DDGClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _patch_ddgs(method: str, return_value: list):
    """Return a context manager that patches DDGS and stubs *method*."""
    return patch("apps.researcher.ddg_client.DDGS")


# ---------------------------------------------------------------------------
# text()
# ---------------------------------------------------------------------------


def test_text_returns_normalised_results():
    raw = [{"title": "T", "href": "https://example.com", "body": "B"}]
    with patch("apps.researcher.ddg_client.DDGS") as MockDDGS:
        MockDDGS.return_value.__enter__.return_value.text.return_value = raw
        results = DDGClient().text("python")
    assert results == [
        {"title": "T", "href": "https://example.com", "body": "B", "type": "web"}
    ]


def test_text_respects_instance_max_results():
    with patch("apps.researcher.ddg_client.DDGS") as MockDDGS:
        ddgs_inst = MockDDGS.return_value.__enter__.return_value
        ddgs_inst.text.return_value = []
        DDGClient(max_results=7).text("q")
        ddgs_inst.text.assert_called_once_with("q", max_results=7)


def test_text_per_call_max_results_overrides_default():
    with patch("apps.researcher.ddg_client.DDGS") as MockDDGS:
        ddgs_inst = MockDDGS.return_value.__enter__.return_value
        ddgs_inst.text.return_value = []
        DDGClient(max_results=10).text("q", max_results=3)
        ddgs_inst.text.assert_called_once_with("q", max_results=3)


def test_text_returns_empty_list_on_exception():
    with patch(
        "apps.researcher.ddg_client.DDGS", side_effect=Exception("network error")
    ):
        results = DDGClient().text("q")
    assert results == []


def test_text_returns_empty_list_when_ddgs_raises_during_call():
    with patch("apps.researcher.ddg_client.DDGS") as MockDDGS:
        MockDDGS.return_value.__enter__.return_value.text.side_effect = Exception(
            "rate limit"
        )
        results = DDGClient().text("q")
    assert results == []


# ---------------------------------------------------------------------------
# news()
# ---------------------------------------------------------------------------


def test_news_returns_normalised_results():
    raw = [
        {
            "title": "News Title",
            "url": "https://news.example.com",
            "body": "News body",
            "source": "BBC",
            "date": "2026-04-01",
        }
    ]
    with patch("apps.researcher.ddg_client.DDGS") as MockDDGS:
        MockDDGS.return_value.__enter__.return_value.news.return_value = raw
        results = DDGClient().news("climate")
    assert len(results) == 1
    r = results[0]
    assert r["type"] == "news"
    assert r["title"] == "News Title"
    assert r["href"] == "https://news.example.com"
    assert r["source"] == "BBC"
    assert r["published_at"] == "2026-04-01"


def test_news_respects_max_results():
    with patch("apps.researcher.ddg_client.DDGS") as MockDDGS:
        ddgs_inst = MockDDGS.return_value.__enter__.return_value
        ddgs_inst.news.return_value = []
        DDGClient(max_results=5).news("q", max_results=2)
        ddgs_inst.news.assert_called_once_with("q", max_results=2)


def test_news_returns_empty_list_on_exception():
    with patch("apps.researcher.ddg_client.DDGS") as MockDDGS:
        MockDDGS.return_value.__enter__.return_value.news.side_effect = Exception(
            "error"
        )
        results = DDGClient().news("q")
    assert results == []


# ---------------------------------------------------------------------------
# videos()
# ---------------------------------------------------------------------------


def test_videos_returns_normalised_results():
    raw = [
        {
            "title": "Video Title",
            "content": "https://video.example.com",
            "description": "Video desc",
            "images": {"large": "https://thumb.example.com"},
        }
    ]
    with patch("apps.researcher.ddg_client.DDGS") as MockDDGS:
        MockDDGS.return_value.__enter__.return_value.videos.return_value = raw
        results = DDGClient().videos("tutorial")
    assert len(results) == 1
    r = results[0]
    assert r["type"] == "video"
    assert r["title"] == "Video Title"
    assert r["video_url"] == "https://video.example.com"
    assert r["thumbnail_url"] == "https://thumb.example.com"


def test_videos_returns_empty_list_on_exception():
    with patch("apps.researcher.ddg_client.DDGS") as MockDDGS:
        MockDDGS.return_value.__enter__.return_value.videos.side_effect = Exception(
            "err"
        )
        results = DDGClient().videos("q")
    assert results == []


# ---------------------------------------------------------------------------
# images()
# ---------------------------------------------------------------------------


def test_images_returns_normalised_results():
    raw = [
        {
            "title": "Image Title",
            "url": "https://page.example.com",
            "thumbnail": "https://thumb.example.com",
            "image": "https://img.example.com",
        }
    ]
    with patch("apps.researcher.ddg_client.DDGS") as MockDDGS:
        MockDDGS.return_value.__enter__.return_value.images.return_value = raw
        results = DDGClient().images("cats")
    assert len(results) == 1
    r = results[0]
    assert r["type"] == "image"
    assert r["title"] == "Image Title"
    assert r["href"] == "https://page.example.com"
    assert r["thumbnail_url"] == "https://thumb.example.com"
    assert r["image_url"] == "https://img.example.com"


def test_images_returns_empty_list_on_exception():
    with patch("apps.researcher.ddg_client.DDGS") as MockDDGS:
        MockDDGS.return_value.__enter__.return_value.images.side_effect = Exception(
            "err"
        )
        results = DDGClient().images("q")
    assert results == []


# ---------------------------------------------------------------------------
# ddgs_options forwarding
# ---------------------------------------------------------------------------


def test_ddgs_options_forwarded_to_constructor():
    with patch("apps.researcher.ddg_client.DDGS") as MockDDGS:
        MockDDGS.return_value.__enter__.return_value.text.return_value = []
        DDGClient(ddgs_options={"proxy": "socks5://localhost:9050"}).text("q")
        MockDDGS.assert_called_once_with(proxy="socks5://localhost:9050")
