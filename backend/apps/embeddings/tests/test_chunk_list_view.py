"""Integration tests for the DocumentChunkListView endpoint.

Run with:
    cd backend && uv run pytest \\
        apps/embeddings/tests/test_chunk_list_view.py -m integration -v
"""

from unittest.mock import patch

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import CustomUser

_DIMS = 1024


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def authenticated_client(api_client, db):
    CustomUser.objects.create_user(
        email="chunklist@example.com",
        password="testpassword123",
    )
    response = api_client.post(
        "/api/token/",
        {"email": "chunklist@example.com", "password": "testpassword123"},
    )
    token = response.data["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return api_client


def _create_document(client, title="Chunk List Doc", content="Alpha. Beta. Gamma."):
    with patch("apps.embeddings.services.embed_texts") as mock_embed:
        mock_embed.return_value = [[0.0] * _DIMS]
        response = client.post(
            "/api/embeddings/documents/",
            {"title": title, "content": content, "source": ""},
            format="json",
        )
    assert response.status_code == status.HTTP_201_CREATED
    return response.data["id"]


@pytest.mark.integration
@pytest.mark.django_db
class TestDocumentChunkListView:
    def test_list_chunks_authenticated(self, authenticated_client):
        """200; chunks ordered by chunk_index; document_title present."""
        doc_id = _create_document(
            authenticated_client,
            content=" ".join(f"Sentence number {i}." for i in range(60)),
        )
        response = authenticated_client.get(
            f"/api/embeddings/documents/{doc_id}/chunks/"
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert isinstance(data, list)
        assert len(data) > 0
        # Every chunk carries document_title
        for chunk in data:
            assert "document_title" in chunk
            assert chunk["document_title"] == "Chunk List Doc"
        # Ordered by chunk_index
        indices = [c["chunk_index"] for c in data]
        assert indices == sorted(indices)

    def test_list_chunks_unauthenticated(self, api_client, authenticated_client):
        """401 for unauthenticated requests."""
        doc_id = _create_document(authenticated_client)
        unauthenticated = APIClient()
        response = unauthenticated.get(
            f"/api/embeddings/documents/{doc_id}/chunks/"
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_chunks_unknown_document(self, authenticated_client):
        """404 when document UUID does not exist."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = authenticated_client.get(
            f"/api/embeddings/documents/{fake_id}/chunks/"
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_list_chunks_empty(self, authenticated_client):
        """200 + empty list for a document that produced no chunks (e.g. empty content).

        Note: ingest_document skips chunk creation for empty content, so the document
        exists but has zero chunks.
        """
        from apps.embeddings.models import Document

        doc = Document.objects.create(title="Empty Doc", source="", content="")
        response = authenticated_client.get(
            f"/api/embeddings/documents/{doc.pk}/chunks/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data == []

    def test_chunk_shape(self, authenticated_client):
        """Each chunk object has the expected fields."""
        doc_id = _create_document(authenticated_client)
        response = authenticated_client.get(
            f"/api/embeddings/documents/{doc_id}/chunks/"
        )
        assert response.status_code == status.HTTP_200_OK
        if response.data:
            chunk = response.data[0]
            expected_fields = (
                "id", "document", "document_title",
                "content", "chunk_index", "created_at",
            )
            for field in expected_fields:
                assert field in chunk, f"Missing field: {field}"
