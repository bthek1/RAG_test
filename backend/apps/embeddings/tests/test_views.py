"""Integration tests for the embeddings API endpoints.

These tests require a live PostgreSQL + pgvector database.
They are marked with @pytest.mark.integration and @pytest.mark.django_db
so they can be skipped when running against the SQLite test settings.

Run with:
    cd backend && uv run pytest apps/embeddings/tests/test_views.py -m integration -v
"""

from unittest.mock import patch

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import CustomUser


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def authenticated_client(api_client, db):
    user = CustomUser.objects.create_user(
        email="test@example.com",
        password="testpassword123",
    )
    response = api_client.post(
        "/api/token/",
        {"email": "test@example.com", "password": "testpassword123"},
    )
    token = response.data["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return api_client


# ---------------------------------------------------------------------------
# Document list / create
# ---------------------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.django_db
class TestDocumentListCreate:
    URL = "/api/embeddings/documents/"

    def test_requires_authentication(self, api_client):
        response = api_client.get(self.URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_empty(self, authenticated_client):
        response = authenticated_client.get(self.URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.data == []

    def test_create_document(self, authenticated_client):
        with patch("apps.embeddings.services.embed_texts") as mock_embed:
            mock_embed.return_value = [[0.0] * 1536]
            response = authenticated_client.post(
                self.URL,
                {"title": "Test Doc", "content": "Some content here.", "source": ""},
                format="json",
            )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["title"] == "Test Doc"

    def test_create_then_list(self, authenticated_client):
        with patch("apps.embeddings.services.embed_texts") as mock_embed:
            mock_embed.return_value = [[0.0] * 1536]
            authenticated_client.post(
                self.URL,
                {
                    "title": "Listed Doc",
                    "content": "Content.",
                    "source": "http://example.com",
                },
                format="json",
            )

        response = authenticated_client.get(self.URL)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["title"] == "Listed Doc"


# ---------------------------------------------------------------------------
# Document detail / delete
# ---------------------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.django_db
class TestDocumentDetail:
    def _create_document(self, client):
        with patch("apps.embeddings.services.embed_texts") as mock_embed:
            mock_embed.return_value = [[0.0] * 1536]
            response = client.post(
                "/api/embeddings/documents/",
                {
                    "title": "Detail Doc",
                    "content": "Detailed content goes here.",
                    "source": "",
                },
                format="json",
            )
        return response.data["id"]

    def test_retrieve_document(self, authenticated_client):
        doc_id = self._create_document(authenticated_client)
        response = authenticated_client.get(f"/api/embeddings/documents/{doc_id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == doc_id

    def test_delete_document(self, authenticated_client):
        doc_id = self._create_document(authenticated_client)
        response = authenticated_client.delete(f"/api/embeddings/documents/{doc_id}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT

        get_response = authenticated_client.get(f"/api/embeddings/documents/{doc_id}/")
        assert get_response.status_code == status.HTTP_404_NOT_FOUND

    def test_requires_authentication(self, api_client, authenticated_client):
        doc_id = self._create_document(authenticated_client)
        response = api_client.get(f"/api/embeddings/documents/{doc_id}/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ---------------------------------------------------------------------------
# Similarity search
# ---------------------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.django_db
class TestSimilaritySearch:
    URL = "/api/embeddings/search/"

    def test_requires_authentication(self, api_client):
        response = api_client.post(self.URL, {"query": "hello"}, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_missing_query_returns_400(self, authenticated_client):
        response = authenticated_client.post(self.URL, {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_search_returns_results(self, authenticated_client):
        # Ingest a document first
        with patch("apps.embeddings.services.embed_texts") as mock_embed:
            mock_embed.return_value = [[0.0] * 1536]
            authenticated_client.post(
                "/api/embeddings/documents/",
                {"title": "Search Doc", "content": "Searchable content.", "source": ""},
                format="json",
            )

        with patch("apps.embeddings.services.embed_texts") as mock_embed:
            mock_embed.return_value = [[0.0] * 1536]
            response = authenticated_client.post(
                self.URL, {"query": "searchable", "top_k": 3}, format="json"
            )

        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)

    def test_top_k_validation(self, authenticated_client):
        response = authenticated_client.post(
            self.URL, {"query": "test", "top_k": 100}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
