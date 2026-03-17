"""Admin tests for the embeddings app.

Tests cover:
- Computed columns: content_preview, embedding_norm, embedding_detail, chunk_count
- ChunkInline N+1 query check
- Nearest-neighbour action (monkeypatched search_similar_chunks)
- Stats endpoint (mocked ORM aggregates via real DB or assertions on structure)

Run:
    cd backend && uv run pytest apps/embeddings/tests/test_admin.py -v
"""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from django.contrib.admin.sites import AdminSite
from django.contrib.messages.storage.fallback import FallbackStorage
from django.test import RequestFactory

from apps.embeddings.admin import (
    ADMIN_STATS_CACHE_KEY,
    ChunkAdmin,
    ChunkInline,
    DocumentAdmin,
)
from apps.embeddings.models import Chunk, Document
from apps.embeddings.services import EMBEDDING_DIMENSIONS

from .factories import ChunkFactory, DocumentFactory

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_request(user=None):
    """Return a GET request with session/messages middleware attached."""
    factory = RequestFactory()
    request = factory.get("/admin/")
    request.session = {}  # type: ignore[assignment]
    messages = FallbackStorage(request)
    request._messages = messages  # type: ignore[attr-defined]
    if user is not None:
        request.user = user
    return request


def _site():
    return AdminSite()


# ---------------------------------------------------------------------------
# DocumentAdmin — computed columns
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestDocumentAdminComputedColumns:
    def setup_method(self):
        self.site = _site()
        self.ma = DocumentAdmin(Document, self.site)

    def test_content_preview_truncates_at_200_chars(self):
        doc = DocumentFactory.build(content="x" * 300)
        doc.id = uuid.uuid4()
        result = self.ma.content_preview(doc)
        # format_html returns a SafeData string containing the truncated text + ellipsis
        assert "x" * 200 in str(result)
        assert "x" * 201 not in str(result)
        assert "&hellip;" in str(result)

    def test_content_preview_no_truncation_for_short_content(self):
        doc = DocumentFactory.build(content="Short content")
        doc.id = uuid.uuid4()
        result = self.ma.content_preview(doc)
        assert result == "Short content"

    def test_chunk_count_annotation(self):
        doc = DocumentFactory.create()
        ChunkFactory.create_batch(3, document=doc)
        request = _make_request()
        qs = self.ma.get_queryset(request)
        annotated_doc = qs.get(pk=doc.pk)
        assert self.ma.chunk_count(annotated_doc) == 3


# ---------------------------------------------------------------------------
# ChunkInline — computed columns & N+1 guard
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestChunkInlineComputedColumns:
    def setup_method(self):
        self.site = _site()
        self.inline = ChunkInline(Document, self.site)

    def test_content_preview_truncates_at_140_chars(self):
        chunk = ChunkFactory.build(content="a" * 200)
        chunk.id = uuid.uuid4()
        result = self.inline.content_preview(chunk)
        assert "a" * 140 in str(result)
        assert "a" * 141 not in str(result)
        assert "&hellip;" in str(result)

    def test_content_preview_no_truncation_for_short_content(self):
        chunk = ChunkFactory.build(content="Hello world")
        chunk.id = uuid.uuid4()
        result = self.inline.content_preview(chunk)
        assert result == "Hello world"

    def test_embedding_norm_unit_vector(self):
        """A known unit vector should report norm ≈ 1.0000."""
        # Build a unit vector: first dim = 1, rest = 0
        vec = [0.0] * EMBEDDING_DIMENSIONS
        vec[0] = 1.0
        chunk = ChunkFactory.build(embedding=vec)
        chunk.id = uuid.uuid4()
        result = self.inline.embedding_norm(chunk)
        assert result == "1.0000"

    def test_embedding_norm_known_vector(self):
        """Norm of [3, 4, 0, ...] should be 5.0000."""
        vec = [0.0] * EMBEDDING_DIMENSIONS
        vec[0] = 3.0
        vec[1] = 4.0
        chunk = ChunkFactory.build(embedding=vec)
        chunk.id = uuid.uuid4()
        result = self.inline.embedding_norm(chunk)
        assert result == "5.0000"

    def test_embedding_norm_none_embedding(self):
        chunk = ChunkFactory.build(embedding=None)
        chunk.id = uuid.uuid4()
        result = self.inline.embedding_norm(chunk)
        assert result == "—"

    @pytest.mark.django_db
    def test_inline_queryset_defers_embedding(self, admin_user):
        doc = DocumentFactory.create()
        ChunkFactory.create_batch(5, document=doc)
        request = _make_request(user=admin_user)
        qs = self.inline.get_queryset(request)
        # deferred field should not be loaded — accessing it would trigger extra queries
        # but the queryset itself should be deferred
        deferred = qs.query.deferred_loading
        # deferred_loading is (set_of_field_names, defer_flag)
        # When defer() is called, the flag is True
        fields_deferred, is_defer = deferred
        assert "embedding" in fields_deferred


# ---------------------------------------------------------------------------
# ChunkAdmin — computed columns & embedding_detail
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestChunkAdminComputedColumns:
    def setup_method(self):
        self.site = _site()
        self.ma = ChunkAdmin(Chunk, self.site)

    def test_content_preview_truncates_at_150_chars(self):
        chunk = ChunkFactory.build(content="z" * 200)
        chunk.id = uuid.uuid4()
        result = self.ma.content_preview(chunk)
        assert "z" * 150 in str(result)
        assert "z" * 151 not in str(result)
        assert "&hellip;" in str(result)

    def test_embedding_detail_structure(self):
        """All expected labels should appear in the HTML output."""
        chunk = ChunkFactory.build()
        chunk.id = uuid.uuid4()
        result = str(self.ma.embedding_detail(chunk))
        for label in [
            "Dimensions",
            "Norm",
            "Min",
            "Max",
            "Mean",
            "First 10 values",
            "Sparsity",
        ]:
            assert label in result, f"Missing label: {label}"

    def test_embedding_detail_correct_dimensions(self):
        chunk = ChunkFactory.build()
        chunk.id = uuid.uuid4()
        result = str(self.ma.embedding_detail(chunk))
        assert str(EMBEDDING_DIMENSIONS) in result

    def test_embedding_detail_unit_vector_norm(self):
        vec = [0.0] * EMBEDDING_DIMENSIONS
        vec[0] = 1.0
        chunk = ChunkFactory.build(embedding=vec)
        chunk.id = uuid.uuid4()
        result = str(self.ma.embedding_detail(chunk))
        assert "1.000000" in result

    def test_embedding_detail_none_embedding(self):
        chunk = ChunkFactory.build(embedding=None)
        chunk.id = uuid.uuid4()
        result = self.ma.embedding_detail(chunk)
        assert result == "No embedding stored."

    def test_embedding_norm_unit_vector(self):
        vec = [0.0] * EMBEDDING_DIMENSIONS
        vec[0] = 1.0
        chunk = ChunkFactory.build(embedding=vec)
        chunk.id = uuid.uuid4()
        result = self.ma.embedding_norm(chunk)
        assert result == "1.0000"


# ---------------------------------------------------------------------------
# Nearest-neighbour admin action
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestNearestNeighbourAction:
    def setup_method(self):
        self.site = _site()
        self.ma = ChunkAdmin(Chunk, self.site)

    def test_action_single_chunk_returns_template_response(self, admin_user):
        doc = DocumentFactory.create()
        query_chunk = ChunkFactory.create(document=doc, chunk_index=0)
        neighbour_chunk = ChunkFactory.create(document=doc, chunk_index=1)
        # Attach a fake distance attribute to mimic annotated queryset result
        neighbour_chunk.distance = 0.12
        neighbour_chunk.document  # ensure FK loaded

        queryset = Chunk.objects.filter(pk=query_chunk.pk)

        with patch(
            "apps.embeddings.admin.search_similar_chunks",
            return_value=[neighbour_chunk],
        ):
            request = _make_request(user=admin_user)
            response = self.ma.find_nearest_neighbours(request, queryset)

        assert response is not None
        assert response.template_name == "admin/embeddings/nearest_neighbours.html"
        assert response.context_data["chunk"] == query_chunk
        assert list(response.context_data["results"]) == [neighbour_chunk]

    def test_action_multi_selection_warns_and_returns_none(self):
        doc = DocumentFactory.create()
        chunk1 = ChunkFactory.create(document=doc, chunk_index=0)
        chunk2 = ChunkFactory.create(document=doc, chunk_index=1)
        queryset = Chunk.objects.filter(pk__in=[chunk1.pk, chunk2.pk])

        request = _make_request()
        response = self.ma.find_nearest_neighbours(request, queryset)

        assert response is None
        storage = list(request._messages)  # type: ignore[attr-defined]
        assert len(storage) == 1
        assert "exactly one" in storage[0].message

    def test_action_excludes_query_chunk_from_results(self, admin_user):
        doc = DocumentFactory.create()
        query_chunk = ChunkFactory.create(document=doc, chunk_index=0)
        neighbour = ChunkFactory.create(document=doc, chunk_index=1)
        neighbour.distance = 0.05
        # search returns both the query chunk itself and the neighbour
        query_chunk.distance = 0.0

        queryset = Chunk.objects.filter(pk=query_chunk.pk)

        with patch(
            "apps.embeddings.admin.search_similar_chunks",
            return_value=[query_chunk, neighbour],
        ):
            request = _make_request(user=admin_user)
            response = self.ma.find_nearest_neighbours(request, queryset)

        assert response is not None
        result_ids = [r.id for r in response.context_data["results"]]
        assert query_chunk.id not in result_ids
        assert neighbour.id in result_ids


# ---------------------------------------------------------------------------
# Stats view
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestStatsView:
    def setup_method(self):
        self.site = _site()
        self.ma = DocumentAdmin(Document, self.site)

    def test_stats_view_returns_200(self, admin_user):
        doc = DocumentFactory.create()
        ChunkFactory.create_batch(3, document=doc)

        request = _make_request(user=admin_user)
        request.user = admin_user
        response = self.ma.stats_view(request)

        assert response.status_code == 200
        assert response.template_name == "admin/embeddings/stats.html"

    def test_stats_view_contains_correct_totals(self, admin_user):
        doc1 = DocumentFactory.create()
        doc2 = DocumentFactory.create()
        ChunkFactory.create_batch(3, document=doc1)
        ChunkFactory.create_batch(7, document=doc2)

        request = _make_request(user=admin_user)
        # Bypass cache for a clean test
        from django.core.cache import cache

        cache.delete(ADMIN_STATS_CACHE_KEY)

        response = self.ma.stats_view(request)
        stats = response.context_data["stats"]

        assert stats["total_docs"] == 2
        assert stats["total_chunks"] == 10
        assert stats["max_chunks"] == 7
        assert stats["min_chunks"] == 3
        assert stats["avg_chunks"] == 5.0

    def test_stats_storage_estimate(self, admin_user):
        doc = DocumentFactory.create()
        ChunkFactory.create_batch(100, document=doc)

        from django.core.cache import cache

        cache.delete(ADMIN_STATS_CACHE_KEY)

        request = _make_request(user=admin_user)
        response = self.ma.stats_view(request)
        stats = response.context_data["stats"]

        expected_mb = round(100 * 1024 * 4 / 1_000_000, 2)
        assert stats["storage_mb"] == expected_mb

    def test_stats_are_cached_on_second_call(self, admin_user):
        """Second call must return the cached value without hitting the DB again."""
        from django.core.cache import cache

        cache.delete(ADMIN_STATS_CACHE_KEY)
        doc = DocumentFactory.create()
        ChunkFactory.create_batch(2, document=doc)

        request = _make_request(user=admin_user)
        # First call — populates cache
        self.ma.stats_view(request)
        # Mutate DB — add more chunks; cached result should not reflect this
        ChunkFactory.create_batch(3, document=doc)

        response = self.ma.stats_view(request)
        stats = response.context_data["stats"]
        # Should still show original count of 2, not 5
        assert stats["total_chunks"] == 2

    def test_stats_cache_key_is_invalidated_manually(self, admin_user):
        from django.core.cache import cache

        doc = DocumentFactory.create()
        ChunkFactory.create_batch(4, document=doc)

        cache.delete(ADMIN_STATS_CACHE_KEY)
        request = _make_request(user=admin_user)
        response = self.ma.stats_view(request)
        assert response.context_data["stats"]["total_chunks"] == 4

        # After deleting cache, fresh DB values are returned
        ChunkFactory.create_batch(1, document=doc)
        cache.delete(ADMIN_STATS_CACHE_KEY)
        response2 = self.ma.stats_view(request)
        assert response2.context_data["stats"]["total_chunks"] == 5

    def test_stats_zero_documents(self, admin_user):
        from django.core.cache import cache

        cache.delete(ADMIN_STATS_CACHE_KEY)
        request = _make_request(user=admin_user)
        response = self.ma.stats_view(request)
        stats = response.context_data["stats"]

        assert stats["total_docs"] == 0
        assert stats["total_chunks"] == 0
        assert stats["avg_chunks"] == 0
        assert stats["storage_mb"] == 0.0


# ---------------------------------------------------------------------------
# DocumentAdmin — queryset N+1 guard
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestDocumentAdminQueryCount:
    def setup_method(self):
        self.site = _site()
        self.ma = DocumentAdmin(Document, self.site)

    def test_list_queryset_annotates_chunk_count_in_single_query(self):
        """chunk_count must be resolved without an extra query per document."""
        docs = DocumentFactory.create_batch(5)
        for doc in docs:
            ChunkFactory.create_batch(3, document=doc)

        request = _make_request()
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        with CaptureQueriesContext(connection) as ctx:
            qs = self.ma.get_queryset(request)
            # Force evaluation and attribute access
            for doc in qs:
                _ = doc._chunk_count

        # Only 1 query should be issued (the annotated SELECT)
        assert len(ctx.captured_queries) == 1, (
            f"Expected 1 query for annotated list, got {len(ctx.captured_queries)}"
        )


# ---------------------------------------------------------------------------
# ChunkAdmin — embedding_detail sparsity & first-10 values
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestChunkAdminEmbeddingDetail:
    def setup_method(self):
        self.site = _site()
        self.ma = ChunkAdmin(Chunk, self.site)

    def test_embedding_detail_sparsity_all_zeros(self):
        """All-zero vector → 100% sparsity."""
        vec = [0.0] * EMBEDDING_DIMENSIONS
        chunk = ChunkFactory.build(embedding=vec)
        chunk.id = uuid.uuid4()
        result = str(self.ma.embedding_detail(chunk))
        assert "100.00%" in result

    def test_embedding_detail_sparsity_no_zeros(self):
        """Vector with all large values → 0% sparsity."""
        vec = [1.0] * EMBEDDING_DIMENSIONS
        chunk = ChunkFactory.build(embedding=vec)
        chunk.id = uuid.uuid4()
        result = str(self.ma.embedding_detail(chunk))
        assert "0.00%" in result

    def test_embedding_detail_first_10_values_present(self):
        """The first 10 float values formatted to 4 d.p. must appear in output."""
        vec = [float(i) * 0.1 for i in range(EMBEDDING_DIMENSIONS)]
        chunk = ChunkFactory.build(embedding=vec)
        chunk.id = uuid.uuid4()
        result = str(self.ma.embedding_detail(chunk))
        # First value is 0.0000
        assert "0.0000" in result
        # Tenth value is 0.9000
        assert "0.9000" in result

    def test_embedding_detail_min_max_mean(self):
        """Min, Max, and Mean values should be accurate."""
        vec = [0.0] * EMBEDDING_DIMENSIONS
        vec[0] = 1.0  # only one non-zero
        chunk = ChunkFactory.build(embedding=vec)
        chunk.id = uuid.uuid4()
        result = str(self.ma.embedding_detail(chunk))
        # min should be 0.000000
        assert "0.000000" in result
        # max should be 1.000000
        assert "1.000000" in result
