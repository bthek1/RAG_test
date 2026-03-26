import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from unittest.mock import patch

User = get_user_model()

MOCK_RESULTS = [
    {
        "title": "T",
        "url": "https://example.com",
        "snippet": "S",
        "scraped_text": "Text",
    },
]


@pytest.fixture
def auth_client(db):
    user = User.objects.create_user(
        email="researcher@example.com", password="testpass123"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
def test_search_returns_200(auth_client):
    with patch("apps.researcher.views.run_search", return_value=MOCK_RESULTS):
        resp = auth_client.post(
            "/api/researcher/search/",
            {"query": "test", "max_results": 1},
            format="json",
        )
    assert resp.status_code == 200
    assert resp.data[0]["title"] == "T"
    assert resp.data[0]["url"] == "https://example.com"


@pytest.mark.django_db
def test_search_returns_all_fields(auth_client):
    with patch("apps.researcher.views.run_search", return_value=MOCK_RESULTS):
        resp = auth_client.post(
            "/api/researcher/search/",
            {"query": "test"},
            format="json",
        )
    assert resp.status_code == 200
    result = resp.data[0]
    assert "title" in result
    assert "url" in result
    assert "snippet" in result
    assert "scraped_text" in result


@pytest.mark.django_db
def test_search_requires_auth():
    resp = APIClient().post(
        "/api/researcher/search/", {"query": "test"}, format="json"
    )
    assert resp.status_code == 401


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
def test_search_default_max_results(auth_client):
    with patch("apps.researcher.views.run_search", return_value=[]) as mock_run:
        auth_client.post(
            "/api/researcher/search/", {"query": "test"}, format="json"
        )
        mock_run.assert_called_once_with(query="test", max_results=5)


@pytest.mark.django_db
def test_search_validates_max_results_too_high(auth_client):
    resp = auth_client.post(
        "/api/researcher/search/",
        {"query": "test", "max_results": 21},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_search_returns_empty_list_when_no_results(auth_client):
    with patch("apps.researcher.views.run_search", return_value=[]):
        resp = auth_client.post(
            "/api/researcher/search/", {"query": "test"}, format="json"
        )
    assert resp.status_code == 200
    assert resp.data == []
