"""Integration tests for embeddings models and search_similar_chunks service.

These tests require a live PostgreSQL + pgvector instance.
Marked with @pytest.mark.integration — skipped when running against SQLite.

Run:
    cd backend && uv run pytest apps/embeddings/tests/test_models.py -m integration -v
"""

from __future__ import annotations

import pytest

from apps.embeddings.models import Chunk, Document
from apps.embeddings.services import (
    EMBEDDING_DIMENSIONS,
    ingest_document,
    search_similar_chunks,
)

from .factories import ChunkFactory, DocumentFactory

# ---------------------------------------------------------------------------
# Model persistence
# ---------------------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.django_db
class TestDocumentModel:
    def test_create_and_retrieve(self):
        doc = DocumentFactory.create(title="Test title", source="http://example.com")
        fetched = Document.objects.get(pk=doc.pk)
        assert fetched.title == "Test title"
        assert fetched.source == "http://example.com"
        assert fetched.created_at is not None

    def test_str_returns_title(self):
        doc = DocumentFactory.create(title="My Document")
        assert str(doc) == "My Document"

    def test_chunks_related_name(self):
        doc = DocumentFactory.create()
        ChunkFactory.create(document=doc, chunk_index=0)
        ChunkFactory.create(document=doc, chunk_index=1)
        assert doc.chunks.count() == 2

    def test_delete_cascade_removes_chunks(self):
        doc = DocumentFactory.create()
        ChunkFactory.create(document=doc, chunk_index=0)
        ChunkFactory.create(document=doc, chunk_index=1)
        assert Chunk.objects.filter(document=doc).count() == 2
        doc.delete()
        assert Chunk.objects.filter(document=doc).count() == 0


@pytest.mark.integration
@pytest.mark.django_db
class TestChunkModel:
    def test_create_and_retrieve(self):
        chunk = ChunkFactory.create(chunk_index=0)
        fetched = Chunk.objects.get(pk=chunk.pk)
        assert fetched.chunk_index == 0
        assert len(fetched.embedding) == EMBEDDING_DIMENSIONS

    def test_str_representation(self):
        doc = DocumentFactory.create(title="Source Doc")
        chunk = ChunkFactory.create(document=doc, chunk_index=3)
        assert "Source Doc" in str(chunk)
        assert "3" in str(chunk)

    def test_ordering_by_document_then_chunk_index(self):
        doc = DocumentFactory.create()
        ChunkFactory.create(document=doc, chunk_index=2)
        ChunkFactory.create(document=doc, chunk_index=0)
        ChunkFactory.create(document=doc, chunk_index=1)
        indexes = list(
            Chunk.objects.filter(document=doc).values_list("chunk_index", flat=True)
        )
        assert indexes == [0, 1, 2]

    def test_embedding_vector_persists_with_correct_dimensions(self):
        chunk = ChunkFactory.create()
        reloaded = Chunk.objects.get(pk=chunk.pk)
        assert len(reloaded.embedding) == EMBEDDING_DIMENSIONS


# ---------------------------------------------------------------------------
# search_similar_chunks — uses the HNSW cosine index
# ---------------------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.django_db
class TestSearchSimilarChunks:
    def test_returns_top_k_chunks(self, fake_embed):
        # Ingest two documents; confirm top_k is respected
        ingest_document(title="Doc A", content="Alpha content. More sentences here.")
        ingest_document(title="Doc B", content="Beta content. Different topic.")

        results = list(search_similar_chunks("alpha", top_k=1))
        assert len(results) == 1

    def test_results_have_distance_annotation(self, fake_embed):
        ingest_document(title="Doc C", content="Content for distance test.")
        results = list(search_similar_chunks("distance", top_k=5))
        for chunk in results:
            assert hasattr(chunk, "distance")
            assert chunk.distance is not None

    def test_returns_chunks_with_related_document(self, fake_embed):
        ingest_document(title="Related Doc", content="Content with related document.")
        results = list(search_similar_chunks("related", top_k=5))
        assert len(results) > 0
        # select_related should have populated document
        for chunk in results:
            assert chunk.document_id is not None
            assert chunk.document.title is not None

    def test_top_k_zero_is_handled_gracefully(self, fake_embed):
        ingest_document(title="Doc Z", content="Some content.")
        results = list(search_similar_chunks("test", top_k=0))
        assert results == []

    def test_empty_corpus_returns_empty(self, fake_embed):
        # No documents ingested — should return empty queryset
        results = list(search_similar_chunks("nothing", top_k=5))
        assert results == []

    def test_returns_chunks_ordered_by_distance(self, fake_embed):
        ingest_document(
            title="Doc Multi",
            content=(
                "First sentence about cats. "
                "Second sentence about dogs. "
                "Third sentence about fish. "
                "Fourth sentence about birds. "
                "Fifth sentence about reptiles."
            ),
        )
        results = list(search_similar_chunks("animals", top_k=5))
        distances = [c.distance for c in results]
        assert distances == sorted(distances)


# ---------------------------------------------------------------------------
# ingest_document — end-to-end pipeline
# ---------------------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.django_db
class TestIngestDocument:
    def test_creates_document_record(self, fake_embed):
        doc = ingest_document(
            title="Ingest Test",
            content="A short piece of content.",
            source="http://source.example.com",
        )
        assert Document.objects.filter(pk=doc.pk).exists()
        assert doc.title == "Ingest Test"

    def test_creates_chunks_for_long_content(self, fake_embed):
        content = "Sentence number {}. " * 40
        content = "".join(f"Sentence number {i}. " for i in range(40))
        doc = ingest_document(title="Long Doc", content=content)
        assert doc.chunks.count() > 1

    def test_empty_content_creates_no_chunks(self, fake_embed):
        doc = ingest_document(title="Empty Doc", content="")
        # Document is still created, but no chunks
        assert Document.objects.filter(pk=doc.pk).exists()
        assert doc.chunks.count() == 0

    def test_chunk_embeddings_have_correct_dimensions(self, fake_embed):
        doc = ingest_document(
            title="Dimension Check",
            content="One sentence. Two sentences. Three sentences.",
        )
        for chunk in doc.chunks.all():
            assert len(chunk.embedding) == EMBEDDING_DIMENSIONS
