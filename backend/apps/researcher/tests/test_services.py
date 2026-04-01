from unittest.mock import patch

import pytest

from apps.researcher.services import run_search

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_WEB_RAW = [{"title": "T", "href": "https://example.com", "body": "B", "type": "web"}]
_NEWS_RAW = [
    {
        "title": "News",
        "href": "https://news.example.com",
        "body": "Body",
        "type": "news",
        "source": "BBC",
        "published_at": "2026-04-01",
    }
]
_VIDEO_RAW = [
    {
        "title": "Video",
        "href": "https://video.example.com",
        "body": "Desc",
        "type": "video",
        "video_url": "https://video.example.com/watch",
        "thumbnail_url": "https://thumb.example.com/img.jpg",
    }
]
_IMAGE_RAW = [
    {
        "title": "Image",
        "href": "https://page.example.com",
        "body": "Desc",
        "type": "image",
        "image_url": "https://img.example.com/photo.jpg",
    }
]


def _mock_scrape(url: str, **_kwargs) -> str:
    return f"scraped:{url}"


# ---------------------------------------------------------------------------
# Routing
# ---------------------------------------------------------------------------


def test_run_search_routes_text_for_web():
    with (
        patch("apps.researcher.services.DDGClient") as MockClient,
        patch("apps.researcher.services.scrape", side_effect=_mock_scrape),
    ):
        inst = MockClient.return_value
        inst.text.return_value = _WEB_RAW
        run_search("q", type="web")
        inst.text.assert_called_once()
        inst.news.assert_not_called()
        inst.videos.assert_not_called()
        inst.images.assert_not_called()


def test_run_search_routes_text_for_all():
    with (
        patch("apps.researcher.services.DDGClient") as MockClient,
        patch("apps.researcher.services.scrape", side_effect=_mock_scrape),
    ):
        inst = MockClient.return_value
        inst.text.return_value = _WEB_RAW
        run_search("q", type="all")
        inst.text.assert_called_once()


def test_run_search_routes_news():
    with (
        patch("apps.researcher.services.DDGClient") as MockClient,
        patch("apps.researcher.services.scrape", side_effect=_mock_scrape),
    ):
        inst = MockClient.return_value
        inst.news.return_value = _NEWS_RAW
        run_search("climate", type="news")
        inst.news.assert_called_once()
        inst.text.assert_not_called()


def test_run_search_routes_videos():
    with (
        patch("apps.researcher.services.DDGClient") as MockClient,
        patch("apps.researcher.services.scrape", side_effect=_mock_scrape),
    ):
        inst = MockClient.return_value
        inst.videos.return_value = _VIDEO_RAW
        run_search("tutorial", type="video")
        inst.videos.assert_called_once()
        inst.text.assert_not_called()


def test_run_search_routes_images():
    with (
        patch("apps.researcher.services.DDGClient") as MockClient,
        patch("apps.researcher.services.scrape", side_effect=_mock_scrape),
    ):
        inst = MockClient.return_value
        inst.images.return_value = _IMAGE_RAW
        run_search("cats", type="image")
        inst.images.assert_called_once()
        inst.text.assert_not_called()


# ---------------------------------------------------------------------------
# Result shape — web
# ---------------------------------------------------------------------------


def test_run_search_web_result_shape():
    with (
        patch("apps.researcher.services.DDGClient") as MockClient,
        patch("apps.researcher.services.scrape", return_value="page text"),
    ):
        MockClient.return_value.text.return_value = _WEB_RAW
        results = run_search("q", type="web")

    assert len(results) == 1
    r = results[0]
    assert r["type"] == "web"
    assert r["title"] == "T"
    assert r["url"] == "https://example.com"
    assert r["snippet"] == "B"
    assert r["scraped_text"] == "page text"


# ---------------------------------------------------------------------------
# Result shape — news
# ---------------------------------------------------------------------------


def test_run_search_news_result_shape():
    with (
        patch("apps.researcher.services.DDGClient") as MockClient,
        patch("apps.researcher.services.scrape", return_value="article text"),
    ):
        MockClient.return_value.news.return_value = _NEWS_RAW
        results = run_search("climate", type="news")

    assert len(results) == 1
    r = results[0]
    assert r["type"] == "news"
    assert r["source"] == "BBC"
    assert r["published_at"] == "2026-04-01"
    assert "video_url" not in r
    assert "images" not in r


# ---------------------------------------------------------------------------
# Result shape — video
# ---------------------------------------------------------------------------


def test_run_search_video_result_shape():
    with (
        patch("apps.researcher.services.DDGClient") as MockClient,
        patch("apps.researcher.services.scrape", return_value="transcript"),
    ):
        MockClient.return_value.videos.return_value = _VIDEO_RAW
        results = run_search("tutorial", type="video")

    assert len(results) == 1
    r = results[0]
    assert r["type"] == "video"
    assert r["video_url"] == "https://video.example.com/watch"
    assert r["thumbnail_url"] == "https://thumb.example.com/img.jpg"
    assert "source" not in r
    assert "images" not in r


# ---------------------------------------------------------------------------
# Result shape — image
# ---------------------------------------------------------------------------


def test_run_search_image_result_shape():
    with (
        patch("apps.researcher.services.DDGClient") as MockClient,
        patch("apps.researcher.services.scrape", return_value="page text"),
    ):
        MockClient.return_value.images.return_value = _IMAGE_RAW
        results = run_search("cats", type="image")

    assert len(results) == 1
    r = results[0]
    assert r["type"] == "image"
    assert r["images"] == ["https://img.example.com/photo.jpg"]
    assert r["original_url"] == "https://page.example.com"
    assert "video_url" not in r


def test_run_search_image_with_no_image_url():
    raw = [{"title": "T", "href": "https://page.example.com", "body": "B", "type": "image"}]
    with (
        patch("apps.researcher.services.DDGClient") as MockClient,
        patch("apps.researcher.services.scrape", return_value=""),
    ):
        MockClient.return_value.images.return_value = raw
        results = run_search("q", type="image")

    assert results[0]["images"] == []


# ---------------------------------------------------------------------------
# max_results forwarding
# ---------------------------------------------------------------------------


def test_run_search_passes_max_results_to_client():
    with (
        patch("apps.researcher.services.DDGClient") as MockClient,
        patch("apps.researcher.services.scrape", return_value=""),
    ):
        inst = MockClient.return_value
        inst.text.return_value = []
        run_search("q", max_results=10)
        MockClient.assert_called_once_with(max_results=10)
        inst.text.assert_called_once_with("q", max_results=10)


# ---------------------------------------------------------------------------
# sort parameter accepted without error
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("sort_value", ["relevance", "date", "popularity"])
def test_run_search_accepts_sort_param(sort_value):
    with (
        patch("apps.researcher.services.DDGClient") as MockClient,
        patch("apps.researcher.services.scrape", return_value=""),
    ):
        MockClient.return_value.text.return_value = []
        # Should not raise
        run_search("q", sort=sort_value)


# ---------------------------------------------------------------------------
# Empty results
# ---------------------------------------------------------------------------


def test_run_search_returns_empty_list_when_no_results():
    with (
        patch("apps.researcher.services.DDGClient") as MockClient,
        patch("apps.researcher.services.scrape", return_value=""),
    ):
        MockClient.return_value.text.return_value = []
        results = run_search("q")
    assert results == []


# ---------------------------------------------------------------------------
# Scrape called for each result
# ---------------------------------------------------------------------------


def test_run_search_scrapes_each_result_url():
    raw = [
        {"title": "A", "href": "https://a.com", "body": "B1", "type": "web"},
        {"title": "B", "href": "https://b.com", "body": "B2", "type": "web"},
    ]
    with (
        patch("apps.researcher.services.DDGClient") as MockClient,
        patch("apps.researcher.services.scrape", side_effect=_mock_scrape) as mock_scrape,
    ):
        MockClient.return_value.text.return_value = raw
        results = run_search("q")

    assert mock_scrape.call_count == 2
    scraped_urls = {c.args[0] for c in mock_scrape.call_args_list}
    assert scraped_urls == {"https://a.com", "https://b.com"}
    assert results[0]["scraped_text"] == "scraped:https://a.com"
    assert results[1]["scraped_text"] == "scraped:https://b.com"
