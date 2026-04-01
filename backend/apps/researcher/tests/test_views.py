import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from unittest.mock import patch

User = get_user_model()

MOCK_WEB_RESULT = {
    "type": "web",
    "title": "T",
    "url": "https://example.com",
    "snippet": "S",
    "scraped_text": "Text",
}

MOCK_NEWS_RESULT = {
    "type": "news",
    "title": "News Title",
    "url": "https://news.example.com",
    "snippet": "News snippet",
    "scraped_text": "Full news text",
    "source": "BBC",
    "published_at": "2026-04-01",
}

MOCK_VIDEO_RESULT = {
    "type": "video",
    "title": "Video Title",
    "url": "https://video.example.com",
    "snippet": "Video desc",
    "scraped_text": "Transcript",
    "video_url": "https://video.example.com/watch",
    "thumbnail_url": "https://thumb.example.com/img.jpg",
}

MOCK_IMAGE_RESULT = {
    "type": "image",
    "title": "Image Title",
    "url": "https://page.example.com",
    "snippet": "Image desc",
    "scraped_text": "Page text",
    "images": ["https://img.example.com/1.jpg"],
    "original_url": "https://page.example.com",
}


@pytest.fixture
def auth_client(db):
    user = User.objects.create_user(
        email="researcher@example.com", password="testpass123"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


# ---------------------------------------------------------------------------
# Basic success / auth
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_search_returns_200(auth_client):
    with patch(
        "apps.researcher.views.run_search", return_value=[MOCK_WEB_RESULT]
    ):
        resp = auth_client.post(
            "/api/researcher/search/",
            {"query": "test", "max_results": 1},
            format="json",
        )
    assert resp.status_code == 200
    assert resp.data[0]["title"] == "T"
    assert resp.data[0]["url"] == "https://example.com"


@pytest.mark.django_db
def test_search_returns_all_base_fields(auth_client):
    with patch(
        "apps.researcher.views.run_search", return_value=[MOCK_WEB_RESULT]
    ):
        resp = auth_client.post(
            "/api/researcher/search/", {"query": "test"}, format="json"
        )
    assert resp.status_code == 200
    result = resp.data[0]
    for field in ("type", "title", "url", "snippet", "scraped_text"):
        assert field in result


@pytest.mark.django_db
def test_search_requires_auth():
    resp = APIClient().post(
        "/api/researcher/search/", {"query": "test"}, format="json"
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_search_validates_empty_query(auth_client):
    resp = auth_client.post(
        "/api/researcher/search/", {"query": ""}, format="json"
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_search_validates_missing_query(auth_client):
    resp = auth_client.post("/api/researcher/search/", {}, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_search_validates_max_results_too_high(auth_client):
    resp = auth_client.post(
        "/api/researcher/search/",
        {"query": "test", "max_results": 21},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_search_validates_invalid_type(auth_client):
    resp = auth_client.post(
        "/api/researcher/search/",
        {"query": "test", "type": "podcast"},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_search_validates_invalid_sort(auth_client):
    resp = auth_client.post(
        "/api/researcher/search/",
        {"query": "test", "sort": "newest"},
        format="json",
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Default values
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_search_default_max_results(auth_client):
    with patch("apps.researcher.views.run_search", return_value=[]) as mock_run:
        auth_client.post(
            "/api/researcher/search/", {"query": "test"}, format="json"
        )
        mock_run.assert_called_once_with(
            query="test", max_results=5, type="all", sort="relevance"
        )


@pytest.mark.django_db
def test_search_default_type_is_all(auth_client):
    with patch("apps.researcher.views.run_search", return_value=[]) as mock_run:
        auth_client.post(
            "/api/researcher/search/",
            {"query": "test", "max_results": 3},
            format="json",
        )
        args = mock_run.call_args[1]
        assert args["type"] == "all"


@pytest.mark.django_db
def test_search_default_sort_is_relevance(auth_client):
    with patch("apps.researcher.views.run_search", return_value=[]) as mock_run:
        auth_client.post(
            "/api/researcher/search/",
            {"query": "test"},
            format="json",
        )
        args = mock_run.call_args[1]
        assert args["sort"] == "relevance"


# ---------------------------------------------------------------------------
# Type routing forwarded to service
# ---------------------------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.parametrize("result_type", ["web", "news", "video", "image", "all"])
def test_search_accepts_valid_types(auth_client, result_type):
    with patch("apps.researcher.views.run_search", return_value=[]) as mock_run:
        resp = auth_client.post(
            "/api/researcher/search/",
            {"query": "test", "type": result_type},
            format="json",
        )
    assert resp.status_code == 200
    assert mock_run.call_args[1]["type"] == result_type


@pytest.mark.django_db
@pytest.mark.parametrize("sort_value", ["relevance", "date", "popularity"])
def test_search_accepts_valid_sorts(auth_client, sort_value):
    with patch("apps.researcher.views.run_search", return_value=[]) as mock_run:
        resp = auth_client.post(
            "/api/researcher/search/",
            {"query": "test", "sort": sort_value},
            format="json",
        )
    assert resp.status_code == 200
    assert mock_run.call_args[1]["sort"] == sort_value


# ---------------------------------------------------------------------------
# Type-specific result shapes
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_search_returns_news_fields(auth_client):
    with patch(
        "apps.researcher.views.run_search", return_value=[MOCK_NEWS_RESULT]
    ):
        resp = auth_client.post(
            "/api/researcher/search/",
            {"query": "climate", "type": "news"},
            format="json",
        )
    assert resp.status_code == 200
    result = resp.data[0]
    assert result["type"] == "news"
    assert result["source"] == "BBC"
    assert result["published_at"] == "2026-04-01"


@pytest.mark.django_db
def test_search_returns_video_fields(auth_client):
    with patch(
        "apps.researcher.views.run_search", return_value=[MOCK_VIDEO_RESULT]
    ):
        resp = auth_client.post(
            "/api/researcher/search/",
            {"query": "tutorial", "type": "video"},
            format="json",
        )
    assert resp.status_code == 200
    result = resp.data[0]
    assert result["type"] == "video"
    assert result["video_url"] == "https://video.example.com/watch"
    assert result["thumbnail_url"] == "https://thumb.example.com/img.jpg"


@pytest.mark.django_db
def test_search_returns_image_fields(auth_client):
    with patch(
        "apps.researcher.views.run_search", return_value=[MOCK_IMAGE_RESULT]
    ):
        resp = auth_client.post(
            "/api/researcher/search/",
            {"query": "cats", "type": "image"},
            format="json",
        )
    assert resp.status_code == 200
    result = resp.data[0]
    assert result["type"] == "image"
    assert isinstance(result["images"], list)
    assert result["original_url"] == "https://page.example.com"


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_search_returns_empty_list_when_no_results(auth_client):
    with patch("apps.researcher.views.run_search", return_value=[]):
        resp = auth_client.post(
            "/api/researcher/search/", {"query": "test"}, format="json"
        )
    assert resp.status_code == 200
    assert resp.data == []

