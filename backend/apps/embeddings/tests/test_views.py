"""Integration tests for the embeddings API endpoints.

These tests require a live PostgreSQL + pgvector database.
They are marked with @pytest.mark.integration and @pytest.mark.django_db
so they can be skipped when running against the SQLite test settings.

Run with:
    cd backend && uv run pytest apps/embeddings/tests/test_views.py -m integration -v
"""

from unittest.mock import patch

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import CustomUser

# Dimension used for all mock embedding vectors in this test module
_DIMS = 1024


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def authenticated_client(api_client, db):
    CustomUser.objects.create_user(
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
            mock_embed.return_value = [[0.0] * _DIMS]
            response = authenticated_client.post(
                self.URL,
                {"title": "Test Doc", "content": "Some content here.", "source": ""},
                format="json",
            )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["title"] == "Test Doc"

    def test_create_then_list(self, authenticated_client):
        with patch("apps.embeddings.services.embed_texts") as mock_embed:
            mock_embed.return_value = [[0.0] * _DIMS]
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
            mock_embed.return_value = [[0.0] * _DIMS]
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

    def test_requires_authentication(self, authenticated_client):
        doc_id = self._create_document(authenticated_client)
        # Create a fresh, unauthenticated client — not the fixture shared with
        # authenticated_client, which would carry its credentials.
        unauthenticated = APIClient()
        response = unauthenticated.get(f"/api/embeddings/documents/{doc_id}/")
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
            mock_embed.return_value = [[0.0] * _DIMS]
            authenticated_client.post(
                "/api/embeddings/documents/",
                {"title": "Search Doc", "content": "Searchable content.", "source": ""},
                format="json",
            )

        with patch("apps.embeddings.services.embed_texts") as mock_embed:
            mock_embed.return_value = [[0.0] * _DIMS]
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


# ---------------------------------------------------------------------------
# RAG endpoint
# ---------------------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.django_db
class TestRAGView:
    URL = "/api/embeddings/rag/"

    def test_requires_authentication(self, api_client):
        response = api_client.post(self.URL, {"query": "hello"}, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_missing_query_returns_400(self, authenticated_client):
        response = authenticated_client.post(self.URL, {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_rag_returns_answer_and_sources(self, authenticated_client):
        # Ingest a document first
        with patch("apps.embeddings.services.embed_texts") as mock_embed:
            mock_embed.return_value = [[0.0] * _DIMS]
            authenticated_client.post(
                "/api/embeddings/documents/",
                {
                    "title": "RAG Doc",
                    "content": "RAG combines retrieval with generation.",
                    "source": "",
                },
                format="json",
            )

        with (
            patch("apps.embeddings.services.embed_texts") as mock_embed,
            patch("apps.embeddings.services.generate_answer") as mock_gen,
        ):
            mock_embed.return_value = [[0.0] * _DIMS]
            mock_gen.return_value = "RAG stands for Retrieval-Augmented Generation."
            response = authenticated_client.post(
                self.URL, {"query": "What is RAG?", "top_k": 3}, format="json"
            )

        assert response.status_code == status.HTTP_200_OK
        assert "answer" in response.data
        assert "sources" in response.data
        expected = "RAG stands for Retrieval-Augmented Generation."
        assert response.data["answer"] == expected
        assert isinstance(response.data["sources"], list)

    def test_rag_source_shape(self, authenticated_client):
        with patch("apps.embeddings.services.embed_texts") as mock_embed:
            mock_embed.return_value = [[0.0] * _DIMS]
            authenticated_client.post(
                "/api/embeddings/documents/",
                {"title": "Shape Doc", "content": "Some content here.", "source": ""},
                format="json",
            )

        with (
            patch("apps.embeddings.services.embed_texts") as mock_embed,
            patch("apps.embeddings.services.generate_answer") as mock_gen,
        ):
            mock_embed.return_value = [[0.0] * _DIMS]
            mock_gen.return_value = "answer text"
            response = authenticated_client.post(
                self.URL, {"query": "content", "top_k": 1}, format="json"
            )

        assert response.status_code == status.HTTP_200_OK
        if response.data["sources"]:
            source = response.data["sources"][0]
            assert "chunk_id" in source
            assert "document_title" in source
            assert "content" in source
            assert "distance" in source

    def test_top_k_validation(self, authenticated_client):
        response = authenticated_client.post(
            self.URL, {"query": "test", "top_k": 100}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------------------
# PDF upload — DocumentListCreateView multipart path
# ---------------------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.django_db
class TestPDFUpload:
    URL = "/api/embeddings/documents/"

    def _pdf_upload(self, client, pdf_bytes: bytes, filename="test.pdf", **extra):
        """POST a multipart/form-data request with a PDF file field."""
        from django.core.files.uploadedfile import SimpleUploadedFile

        file_obj = SimpleUploadedFile(
            filename, pdf_bytes, content_type="application/pdf"
        )
        return client.post(
            self.URL,
            {"title": "PDF Doc", "file": file_obj, **extra},
            format="multipart",
        )

    def test_pdf_upload_valid(self, authenticated_client):
        """Valid PDF content → 201 with chunk_count ≥ 1."""
        extracted_text = "This is page one. " * 30

        with (
            patch("apps.embeddings.services.extract_text_from_pdf") as mock_extract,
            patch("apps.embeddings.services.embed_texts") as mock_embed,
        ):
            mock_extract.return_value = extracted_text
            mock_embed.return_value = [[0.0] * _DIMS]
            response = self._pdf_upload(authenticated_client, b"fake-pdf")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["chunk_count"] >= 1

    def test_pdf_upload_image_only(self, authenticated_client):
        """extract_text_from_pdf raises ValueError → 400 with file error."""
        with patch("apps.embeddings.services.extract_text_from_pdf") as mock_extract:
            mock_extract.side_effect = ValueError("No extractable text found.")
            response = self._pdf_upload(authenticated_client, b"image-pdf")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_pdf_upload_too_large(self, authenticated_client):
        """File exceeding 50 MB → 400."""
        fifty_one_mb = b"x" * (51 * 1024 * 1024)
        response = self._pdf_upload(authenticated_client, fifty_one_mb)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_pdf_upload_wrong_extension(self, authenticated_client):
        """Non-.pdf filename → 400."""
        response = self._pdf_upload(authenticated_client, b"data", filename="doc.txt")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_pdf_upload_with_content_also_present(self, authenticated_client):
        """Providing both file and content → 400."""
        from django.core.files.uploadedfile import SimpleUploadedFile

        file_obj = SimpleUploadedFile(
            "test.pdf", b"fake", content_type="application/pdf"
        )
        response = authenticated_client.post(
            self.URL,
            {"title": "Both", "file": file_obj, "content": "some text"},
            format="multipart",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_neither_content_nor_file(self, authenticated_client):
        """No content or file → 400."""
        response = authenticated_client.post(
            self.URL, {"title": "Nothing"}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_text_ingest_still_works(self, authenticated_client):
        """Original JSON text path must remain functional."""
        with patch("apps.embeddings.services.embed_texts") as mock_embed:
            mock_embed.return_value = [[0.0] * _DIMS]
            response = authenticated_client.post(
                self.URL,
                {
                    "title": "Text Doc",
                    "content": "Some text content here.",
                    "source": "",
                },
                format="json",
            )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["title"] == "Text Doc"
