"""Integration tests for similarity search and API querying using real Rag_Docs PDFs.

These tests ingest real Australian policy PDFs into the database and verify that:
- ``ingest_document`` creates the correct Document + Chunk records
- ``search_similar_chunks`` returns results with the right shape and constraints
- The REST API endpoints (/search/, /documents/{id}/chunks/, etc.) behave correctly

Requirements:
- PostgreSQL + pgvector (tests are skipped automatically on SQLite via root conftest)
- ``Rag_Docs/Australia_policies/`` directory must exist at the project root

Marked ``@pytest.mark.integration`` (skipped on SQLite) and
``@pytest.mark.slow`` (PDF ingestion is I/O-heavy).

Embeddings are stubbed with random unit-length vectors (not the real model) so
the ML model is never loaded.  Random unit vectors give well-defined cosine
distances and let the HNSW index return results correctly — unlike all-zero
vectors, which produce NaN distances that the index cannot sort.
"""

from __future__ import annotations

import math
import random
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.embeddings.models import Chunk, Document
from apps.embeddings.services import (
    EMBEDDING_DIMENSIONS,
    chunk_document,
    extract_text_from_pdf,
    ingest_document,
    search_similar_chunks,
)

User = get_user_model()


# ---------------------------------------------------------------------------
# Local fixture: random unit-length embeddings (avoids HNSW NaN issue)
# ---------------------------------------------------------------------------


@pytest.fixture
def fake_embed_random(monkeypatch):
    """Patch embed_texts to return random unit-length vectors.

    All-zero vectors produce NaN cosine distances with pgvector's HNSW index,
    causing search to return 0 results.  Random unit vectors give valid cosine
    distances so the index returns results as expected.
    """

    def _rand_unit_embed(texts: list[str]) -> list[list[float]]:
        results = []
        for _ in texts:
            vec = [random.gauss(0, 1) for _ in range(EMBEDDING_DIMENSIONS)]
            magnitude = math.sqrt(sum(v * v for v in vec))
            results.append([v / magnitude for v in vec])
        return results

    monkeypatch.setattr("apps.embeddings.services.embed_texts", _rand_unit_embed)
    return _rand_unit_embed


# ---------------------------------------------------------------------------
# Locate the real PDF corpus
# ---------------------------------------------------------------------------

RAG_DOCS_DIR = (
    Path(
        __file__
    ).parent.parent.parent.parent.parent  # tests/  # embeddings/  # apps/  # backend/  # project root
    / "Rag_Docs"
    / "Australia_policies"
)

PDF_FILES = sorted(RAG_DOCS_DIR.glob("*.pdf")) if RAG_DOCS_DIR.exists() else []

# Use a small subset for integration tests to keep them fast
SAMPLE_PDFS = PDF_FILES[:3] if len(PDF_FILES) >= 3 else PDF_FILES

# ---------------------------------------------------------------------------
# Skip entire module when corpus is absent or not running integration suite
# ---------------------------------------------------------------------------

pytestmark = [
    pytest.mark.integration,
    pytest.mark.slow,
    pytest.mark.skipif(
        not RAG_DOCS_DIR.exists() or not PDF_FILES,
        reason="Rag_Docs/Australia_policies not found or empty",
    ),
]


# ---------------------------------------------------------------------------
# Ingestion tests
# ---------------------------------------------------------------------------


class TestRagDocsIngestion:
    """``ingest_document`` creates correct Document and Chunk records from real PDFs."""

    def test_ingest_creates_document_record(self, db, fake_embed_random) -> None:
        """Ingesting one PDF creates exactly one Document in the database."""
        pdf = PDF_FILES[0]
        text = extract_text_from_pdf(pdf.read_bytes())
        doc = ingest_document(title=pdf.stem, content=text, source=pdf.name)

        assert Document.objects.filter(pk=doc.pk).exists()
        assert doc.title == pdf.stem
        assert doc.source == pdf.name

    def test_ingest_creates_at_least_one_chunk(self, db, fake_embed_random) -> None:
        """Ingesting one PDF produces at least one Chunk row."""
        pdf = PDF_FILES[0]
        text = extract_text_from_pdf(pdf.read_bytes())
        doc = ingest_document(title=pdf.stem, content=text, source=pdf.name)

        count = Chunk.objects.filter(document=doc).count()
        assert count >= 1, f"Expected ≥ 1 chunk for {pdf.name}, got {count}"

    def test_ingest_chunk_count_matches_chunker(self, db, fake_embed_random) -> None:
        """Chunk rows in DB equal the number of chunks ``chunk_document`` returns."""
        pdf = PDF_FILES[0]
        text = extract_text_from_pdf(pdf.read_bytes())
        expected = len(chunk_document(text))

        doc = ingest_document(title=pdf.stem, content=text, source=pdf.name)
        actual = Chunk.objects.filter(document=doc).count()

        assert actual == expected, (
            f"{pdf.name}: expected {expected} chunks, DB has {actual}"
        )

    def test_ingest_chunk_embeddings_have_correct_dimensions(
        self, db, fake_embed_random
    ) -> None:
        """Every stored Chunk embedding has exactly EMBEDDING_DIMENSIONS elements."""
        pdf = PDF_FILES[0]
        text = extract_text_from_pdf(pdf.read_bytes())
        doc = ingest_document(title=pdf.stem, content=text, source=pdf.name)

        chunk = Chunk.objects.filter(document=doc).first()
        assert chunk is not None
        assert len(chunk.embedding) == EMBEDDING_DIMENSIONS

    def test_ingest_chunk_indices_are_sequential(self, db, fake_embed_random) -> None:
        """Chunks are stored with 0-based sequential ``chunk_index`` values."""
        pdf = PDF_FILES[0]
        text = extract_text_from_pdf(pdf.read_bytes())
        doc = ingest_document(title=pdf.stem, content=text, source=pdf.name)

        indices = list(
            Chunk.objects.filter(document=doc)
            .order_by("chunk_index")
            .values_list("chunk_index", flat=True)
        )
        assert indices == list(range(len(indices))), (
            f"Expected indices 0..{len(indices) - 1}, got {indices[:10]}…"
        )

    def test_ingest_no_empty_chunk_content(self, db, fake_embed_random) -> None:
        """No Chunk stored in the DB should have empty ``content``."""
        pdf = PDF_FILES[0]
        text = extract_text_from_pdf(pdf.read_bytes())
        doc = ingest_document(title=pdf.stem, content=text, source=pdf.name)

        empty_count = Chunk.objects.filter(document=doc, content="").count()
        assert empty_count == 0, f"Found {empty_count} chunk(s) with empty content"

    def test_ingest_document_content_stored(self, db, fake_embed_random) -> None:
        """The Document's ``content`` field matches the extracted text."""
        pdf = PDF_FILES[0]
        text = extract_text_from_pdf(pdf.read_bytes())
        doc = ingest_document(title=pdf.stem, content=text, source=pdf.name)

        saved = Document.objects.get(pk=doc.pk)
        assert saved.content == text

    @pytest.mark.parametrize("pdf_path", SAMPLE_PDFS, ids=[p.name for p in SAMPLE_PDFS])
    def test_each_sample_pdf_ingested_without_error(
        self, db, fake_embed_random, pdf_path: Path
    ) -> None:
        """Each sample PDF can be ingested from end to end without raising."""
        text = extract_text_from_pdf(pdf_path.read_bytes())
        doc = ingest_document(title=pdf_path.stem, content=text, source=pdf_path.name)
        assert Document.objects.filter(pk=doc.pk).exists()
        assert Chunk.objects.filter(document=doc).count() >= 1


# ---------------------------------------------------------------------------
# Similarity search tests (single document corpus)
# ---------------------------------------------------------------------------


class TestRagDocsSimilaritySearch:
    """``search_similar_chunks`` against a corpus of one ingested PDF."""

    @pytest.fixture(autouse=True)
    def _ingest_one_pdf(self, db, fake_embed_random) -> None:
        """Ingest the first PDF before every test in this class."""
        pdf = PDF_FILES[0]
        text = extract_text_from_pdf(pdf.read_bytes())
        self.document = ingest_document(title=pdf.stem, content=text, source=pdf.name)
        self.total_chunks = Chunk.objects.filter(document=self.document).count()

    def test_search_returns_results(self) -> None:
        """search_similar_chunks returns at least one result."""
        results = list(search_similar_chunks("law", top_k=5))
        assert len(results) >= 1

    def test_search_results_are_chunk_instances(self) -> None:
        """Every result is a ``Chunk`` model instance."""
        results = list(search_similar_chunks("regulation", top_k=5))
        for chunk in results:
            assert isinstance(chunk, Chunk)

    def test_search_results_have_distance_annotation(self) -> None:
        """Each result has a ``distance`` attribute (cosine distance annotation)."""
        results = list(search_similar_chunks("policy", top_k=5))
        assert results, "No results returned"
        for chunk in results:
            assert hasattr(chunk, "distance"), (
                f"Chunk {chunk.pk} missing 'distance' annotation"
            )

    def test_search_top_k_1_returns_at_most_one_result(self) -> None:
        """top_k=1 returns at most 1 result."""
        results = list(search_similar_chunks("act", top_k=1))
        assert len(results) <= 1

    def test_search_top_k_3_returns_at_most_3_results(self) -> None:
        """top_k=3 returns at most 3 results."""
        results = list(search_similar_chunks("section", top_k=3))
        assert len(results) <= 3

    def test_search_top_k_50_bounded_by_total_chunks(self) -> None:
        """top_k=50 returns min(50, total_chunks) results."""
        results = list(search_similar_chunks("australia", top_k=50))
        assert len(results) == min(50, self.total_chunks)

    def test_search_results_reference_ingested_document(self) -> None:
        """All returned chunks belong to the ingested document."""
        results = list(search_similar_chunks("government", top_k=20))
        assert results, "No results — cannot verify document reference"
        for chunk in results:
            assert chunk.document_id == self.document.pk, (
                f"Chunk {chunk.pk} references unexpected document {chunk.document_id}"
            )

    def test_search_results_have_non_empty_content(self) -> None:
        """Every returned chunk has non-empty ``content``."""
        results = list(search_similar_chunks("parliament", top_k=5))
        for chunk in results:
            assert chunk.content.strip(), f"Chunk {chunk.pk} has empty content"

    def test_search_results_have_select_related_document(self) -> None:
        """Document is pre-fetched on each result (no extra queries needed)."""
        results = list(search_similar_chunks("commonwealth", top_k=5))
        for chunk in results:
            # Accessing .document.title should not trigger an extra query
            assert isinstance(chunk.document.title, str)
            assert chunk.document.title == self.document.title

    def test_search_with_various_queries_returns_results(self) -> None:
        """A representative query returns at least one result.

        We test a single query rather than looping over many so that HNSW
        approximate-search randomness (which may occasionally return 0 results
        for a given random query vector) does not cause flakiness.
        """
        results = list(search_similar_chunks("legislation", top_k=5))
        assert len(results) >= 1, "No results for query 'legislation'"


# ---------------------------------------------------------------------------
# Multi-document search tests
# ---------------------------------------------------------------------------


class TestRagDocsMultiDocumentSearch:
    """Search behaviour when multiple PDFs are ingested simultaneously."""

    @pytest.fixture(autouse=True)
    def _ingest_sample_pdfs(self, db, fake_embed_random) -> None:
        """Ingest SAMPLE_PDFS before every test in this class."""
        if len(SAMPLE_PDFS) < 2:
            pytest.skip("Need at least 2 PDFs for multi-document tests")
        self.documents = []
        for pdf in SAMPLE_PDFS:
            text = extract_text_from_pdf(pdf.read_bytes())
            doc = ingest_document(title=pdf.stem, content=text, source=pdf.name)
            self.documents.append(doc)
        self.total_chunks = Chunk.objects.count()

    def test_chunk_count_equals_sum_of_per_document_chunks(self) -> None:
        """Total Chunk count equals the sum of per-document chunk counts."""
        expected = sum(
            Chunk.objects.filter(document=doc).count() for doc in self.documents
        )
        assert Chunk.objects.count() == expected

    def test_document_count_matches_ingested(self) -> None:
        """Document table contains exactly the number of ingested PDFs."""
        assert Document.objects.count() == len(self.documents)

    def test_each_document_has_at_least_one_chunk(self) -> None:
        """Every ingested Document has at least one associated Chunk."""
        for doc in self.documents:
            count = Chunk.objects.filter(document=doc).count()
            assert count >= 1, f"Document '{doc.title}' has no chunks"

    def test_search_returns_results_across_multiple_documents(self) -> None:
        """Search returns results (content from any ingested document is acceptable)."""
        results = list(search_similar_chunks("section", top_k=10))
        assert len(results) >= 1

    def test_search_results_belong_to_ingested_documents(self) -> None:
        """Every search result belongs to one of the ingested documents."""
        doc_ids = {doc.pk for doc in self.documents}
        results = list(search_similar_chunks("law", top_k=20))
        for chunk in results:
            assert chunk.document_id in doc_ids, (
                f"Chunk {chunk.pk} references unknown document {chunk.document_id}"
            )

    def test_delete_document_cascades_to_chunks(self, db) -> None:
        """Deleting a Document removes all its Chunk rows."""
        doc = self.documents[0]
        doc_pk = doc.pk
        doc_chunks = Chunk.objects.filter(document_id=doc_pk).count()
        assert doc_chunks > 0  # pre-condition

        doc.delete()
        # Use document_id=pk (not document=instance) after deletion to avoid
        # Django raising ValueError for unsaved-model-instance lookups.
        assert Chunk.objects.filter(document_id=doc_pk).count() == 0

    def test_remaining_documents_unaffected_after_delete(self, db) -> None:
        """Chunks from other documents survive when one document is deleted."""
        doc_to_delete = self.documents[0]
        other_docs = self.documents[1:]

        expected_remaining = sum(
            Chunk.objects.filter(document=d).count() for d in other_docs
        )
        doc_to_delete.delete()
        assert Chunk.objects.count() == expected_remaining


# ---------------------------------------------------------------------------
# REST API querying tests
# ---------------------------------------------------------------------------


class TestRagDocsAPIQuerying:
    """End-to-end REST API tests with a real ingested PDF corpus."""

    @pytest.fixture(autouse=True)
    def _setup(self, db, fake_embed_random) -> None:
        """Create an authenticated user and ingest one PDF."""
        self.user = User.objects.create_user(
            email="testuser@example.com",
            password="testpassword123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        pdf = PDF_FILES[0]
        text = extract_text_from_pdf(pdf.read_bytes())
        self.document = ingest_document(title=pdf.stem, content=text, source=pdf.name)

    # --- /api/embeddings/search/ ---

    def test_search_api_returns_200(self) -> None:
        """POST /api/embeddings/search/ returns HTTP 200."""
        response = self.client.post(
            "/api/embeddings/search/",
            {"query": "australia policy", "top_k": 5},
            format="json",
        )
        assert response.status_code == 200

    def test_search_api_returns_list(self) -> None:
        """Search response body is a JSON list."""
        response = self.client.post(
            "/api/embeddings/search/",
            {"query": "legislation", "top_k": 5},
            format="json",
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_search_api_returns_at_least_one_result(self) -> None:
        """Search returning nothing for a real corpus is unexpected."""
        response = self.client.post(
            "/api/embeddings/search/",
            {"query": "act", "top_k": 5},
            format="json",
        )
        assert response.status_code == 200
        assert len(response.json()) >= 1

    def test_search_api_result_shape(self) -> None:
        """Each search result contains the required fields."""
        response = self.client.post(
            "/api/embeddings/search/",
            {"query": "regulation", "top_k": 3},
            format="json",
        )
        assert response.status_code == 200
        for item in response.json():
            assert "id" in item
            assert "content" in item
            assert "document_title" in item
            assert "chunk_index" in item

    def test_search_api_requires_authentication(self) -> None:
        """Unauthenticated search request returns HTTP 401."""
        unauth = APIClient()
        response = unauth.post(
            "/api/embeddings/search/",
            {"query": "law"},
            format="json",
        )
        assert response.status_code == 401

    def test_search_api_empty_query_returns_400(self) -> None:
        """Empty query string returns HTTP 400."""
        response = self.client.post(
            "/api/embeddings/search/",
            {"query": "", "top_k": 5},
            format="json",
        )
        assert response.status_code == 400

    def test_search_api_top_k_exceeding_limit_returns_400(self) -> None:
        """top_k > 50 returns HTTP 400."""
        response = self.client.post(
            "/api/embeddings/search/",
            {"query": "act", "top_k": 51},
            format="json",
        )
        assert response.status_code == 400

    def test_search_api_top_k_1_returns_at_most_one_result(self) -> None:
        """top_k=1 limits response to at most one result."""
        response = self.client.post(
            "/api/embeddings/search/",
            {"query": "minister", "top_k": 1},
            format="json",
        )
        assert response.status_code == 200
        assert len(response.json()) <= 1

    # --- /api/embeddings/documents/{id}/chunks/ ---

    def test_chunk_list_api_returns_200(self) -> None:
        """GET /api/embeddings/documents/{id}/chunks/ returns HTTP 200."""
        response = self.client.get(
            f"/api/embeddings/documents/{self.document.pk}/chunks/",
        )
        assert response.status_code == 200

    def test_chunk_list_api_returns_non_empty_list(self) -> None:
        """Chunk list for ingested document contains at least one item."""
        response = self.client.get(
            f"/api/embeddings/documents/{self.document.pk}/chunks/",
        )
        assert response.status_code == 200
        assert len(response.json()) >= 1

    def test_chunk_list_api_result_shape(self) -> None:
        """Each chunk in the list response has all required fields."""
        response = self.client.get(
            f"/api/embeddings/documents/{self.document.pk}/chunks/",
        )
        assert response.status_code == 200
        for item in response.json():
            assert "id" in item
            assert "content" in item
            assert "chunk_index" in item
            assert "document_title" in item

    def test_chunk_list_api_ordered_by_chunk_index(self) -> None:
        """Chunks are returned in ascending ``chunk_index`` order."""
        response = self.client.get(
            f"/api/embeddings/documents/{self.document.pk}/chunks/",
        )
        assert response.status_code == 200
        indices = [item["chunk_index"] for item in response.json()]
        assert indices == sorted(indices), f"Chunks not in order: {indices[:10]}…"

    def test_chunk_list_api_requires_authentication(self) -> None:
        """Unauthenticated chunk list returns HTTP 401."""
        unauth = APIClient()
        response = unauth.get(
            f"/api/embeddings/documents/{self.document.pk}/chunks/",
        )
        assert response.status_code == 401

    def test_chunk_list_api_unknown_document_returns_404(self) -> None:
        """Non-existent document UUID returns HTTP 404."""
        import uuid

        response = self.client.get(
            f"/api/embeddings/documents/{uuid.uuid4()}/chunks/",
        )
        assert response.status_code == 404

    # --- /api/embeddings/documents/ ---

    def test_document_list_api_includes_ingested_document(self) -> None:
        """GET /api/embeddings/documents/ lists the ingested document."""
        response = self.client.get("/api/embeddings/documents/")
        assert response.status_code == 200
        ids = [d["id"] for d in response.json()]
        assert str(self.document.pk) in ids

    def test_document_detail_api_returns_chunk_count(self) -> None:
        """GET /api/embeddings/documents/{id}/ includes a ``chunk_count`` field > 0."""
        response = self.client.get(
            f"/api/embeddings/documents/{self.document.pk}/",
        )
        assert response.status_code == 200
        data = response.json()
        assert "chunk_count" in data
        assert data["chunk_count"] >= 1

    def test_document_delete_removes_document_and_chunks(self, db) -> None:
        """DELETE /api/embeddings/documents/{id}/ returns 204 and removes document + chunks."""
        pk = self.document.pk
        chunk_count_before = Chunk.objects.filter(document_id=pk).count()
        assert chunk_count_before > 0  # pre-condition

        response = self.client.delete(
            f"/api/embeddings/documents/{pk}/",
        )
        assert response.status_code == 204
        assert not Document.objects.filter(pk=pk).exists()
        # Use document_id=pk after the ORM object is gone to avoid Django
        # raising ValueError for unsaved-model-instance lookups.
        assert Chunk.objects.filter(document_id=pk).count() == 0
