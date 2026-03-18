"""Tests for Celery tasks: ingest_document and reembed_document.

With ``CELERY_TASK_ALWAYS_EAGER = True`` and ``CELERY_TASK_EAGER_PROPAGATES = True``
(set in ``core/settings/test.py``), tasks invoked via ``.delay()`` or
``.apply_async()`` run synchronously in the same process — no broker required.

Test markers used:
- ``@pytest.mark.django_db`` — tests that touch the DB but do NOT create Chunk
  records (no pgvector operations; safe with the SQLite test database).
- ``@pytest.mark.integration`` + ``@pytest.mark.django_db`` — tests that create
  or query Chunk records (VectorField requires PostgreSQL + pgvector).

Run all tasks tests::

    cd backend && uv run pytest apps/embeddings/tests/test_tasks.py -v

Run integration tasks tests only (requires PostgreSQL)::

    cd backend && uv run pytest apps/embeddings/tests/test_tasks.py -m integration -v
"""

from __future__ import annotations

import pytest

from apps.embeddings.models import Chunk, Document
from apps.embeddings.tasks import ingest_document, reembed_document

_DIMS = 1024


# ---------------------------------------------------------------------------
# ingest_document
# ---------------------------------------------------------------------------


class TestIngestDocumentTask:
    """Tests for the ingest_document Celery task."""

    @pytest.mark.django_db
    def test_raises_for_missing_document(self, db):
        """Task must raise Document.DoesNotExist when the ID does not exist."""
        with pytest.raises(Document.DoesNotExist):
            ingest_document("00000000-0000-0000-0000-000000000000")

    @pytest.mark.django_db
    def test_empty_content_creates_no_chunks(self, db, fake_embed):
        """Document with empty content produces zero chunks and no DB rows."""
        doc = Document.objects.create(title="Empty", content="", source="")
        result = ingest_document(str(doc.pk))
        assert result == {"document_id": str(doc.pk), "chunk_count": 0}
        assert Chunk.objects.filter(document=doc).count() == 0

    @pytest.mark.integration
    @pytest.mark.django_db
    def test_creates_chunks_for_non_empty_content(self, db, fake_embed):
        """Task creates at least one Chunk for a document with real content."""
        doc = Document.objects.create(
            title="Hello",
            content="First sentence. Second sentence. Third sentence.",
            source="test",
        )
        result = ingest_document(str(doc.pk))
        assert result["document_id"] == str(doc.pk)
        assert result["chunk_count"] > 0
        assert Chunk.objects.filter(document=doc).count() == result["chunk_count"]

    @pytest.mark.integration
    @pytest.mark.django_db
    def test_chunk_indices_are_sequential_from_zero(self, db, fake_embed):
        """Chunk indices must start at 0 and be contiguous."""
        content = " ".join([f"Sentence number {i} ends here." for i in range(60)])
        doc = Document.objects.create(title="Long Doc", content=content, source="")
        ingest_document(str(doc.pk))
        indices = list(
            Chunk.objects.filter(document=doc)
            .order_by("chunk_index")
            .values_list("chunk_index", flat=True)
        )
        assert indices == list(range(len(indices)))

    @pytest.mark.integration
    @pytest.mark.django_db
    def test_chunk_embeddings_have_correct_dimensions(self, db, fake_embed):
        """Each stored embedding vector must have EMBEDDING_DIMENSIONS elements."""
        doc = Document.objects.create(
            title="Dims",
            content="Check embedding dimensions are correct here.",
            source="",
        )
        ingest_document(str(doc.pk))
        chunk = Chunk.objects.filter(document=doc).first()
        assert chunk is not None
        assert len(chunk.embedding) == _DIMS

    @pytest.mark.integration
    @pytest.mark.django_db
    def test_returns_summary_dict(self, db, fake_embed):
        """Return value must be a dict with document_id and chunk_count keys."""
        doc = Document.objects.create(
            title="Summary", content="Some content.", source=""
        )
        result = ingest_document(str(doc.pk))
        assert set(result.keys()) == {"document_id", "chunk_count"}
        assert result["document_id"] == str(doc.pk)
        assert isinstance(result["chunk_count"], int)
        assert result["chunk_count"] >= 0

    @pytest.mark.integration
    @pytest.mark.django_db
    def test_does_not_delete_existing_chunks(self, db, fake_embed):
        """Calling ingest_document twice appends chunks rather than replacing them."""
        doc = Document.objects.create(
            title="Double Ingest",
            content="One sentence. Two sentences.",
            source="",
        )
        ingest_document(str(doc.pk))
        first_count = Chunk.objects.filter(document=doc).count()
        ingest_document(str(doc.pk))
        second_count = Chunk.objects.filter(document=doc).count()
        assert second_count == first_count * 2


# ---------------------------------------------------------------------------
# reembed_document
# ---------------------------------------------------------------------------


class TestReembedDocumentTask:
    """Tests for the reembed_document Celery task."""

    @pytest.mark.django_db
    def test_raises_for_missing_document(self, db):
        """Task must raise Document.DoesNotExist when the ID does not exist."""
        with pytest.raises(Document.DoesNotExist):
            reembed_document("00000000-0000-0000-0000-000000000001")

    @pytest.mark.integration
    @pytest.mark.django_db
    def test_replaces_existing_chunks_with_new_records(self, db, fake_embed):
        """Old Chunk PKs must be gone; new Chunk PKs must exist after re-embed."""
        doc = Document.objects.create(
            title="Replace",
            content="Sentence one. Sentence two. Sentence three.",
            source="",
        )
        ingest_document(str(doc.pk))
        first_pks = set(Chunk.objects.filter(document=doc).values_list("pk", flat=True))
        assert first_pks, "Pre-condition: at least one chunk must exist"

        reembed_document(str(doc.pk))
        second_pks = set(
            Chunk.objects.filter(document=doc).values_list("pk", flat=True)
        )
        assert second_pks, "Post-condition: chunks must exist after re-embed"
        assert first_pks.isdisjoint(second_pks), "All chunks must be new records"

    @pytest.mark.integration
    @pytest.mark.django_db
    def test_works_with_no_prior_chunks(self, db, fake_embed):
        """Re-embedding a document that has no chunks still produces Chunk records."""
        doc = Document.objects.create(
            title="NoPrior",
            content="Fresh sentence here to be embedded.",
            source="",
        )
        result = reembed_document(str(doc.pk))
        assert result["chunk_count"] > 0
        assert Chunk.objects.filter(document=doc).count() == result["chunk_count"]

    @pytest.mark.integration
    @pytest.mark.django_db
    def test_empty_content_deletes_all_existing_chunks(self, db, fake_embed):
        """Re-embedding a document whose content was cleared removes all chunks."""
        doc = Document.objects.create(
            title="ClearMe",
            content="Original content that will be cleared.",
            source="",
        )
        ingest_document(str(doc.pk))
        assert Chunk.objects.filter(document=doc).count() > 0

        doc.content = ""
        doc.save()
        result = reembed_document(str(doc.pk))

        assert result == {"document_id": str(doc.pk), "chunk_count": 0}
        assert Chunk.objects.filter(document=doc).count() == 0

    @pytest.mark.integration
    @pytest.mark.django_db
    def test_returns_summary_dict(self, db, fake_embed):
        """Return value must be a dict with document_id and chunk_count keys."""
        doc = Document.objects.create(
            title="Summary2", content="Some text here.", source=""
        )
        result = reembed_document(str(doc.pk))
        assert set(result.keys()) == {"document_id", "chunk_count"}
        assert result["document_id"] == str(doc.pk)
        assert isinstance(result["chunk_count"], int)
        assert result["chunk_count"] >= 0

    @pytest.mark.integration
    @pytest.mark.django_db
    def test_chunk_indices_reset_after_reembed(self, db, fake_embed):
        """Chunk indices start from 0 after re-embedding (no stale index offsets)."""
        content = " ".join([f"Sentence {i} ends here." for i in range(50)])
        doc = Document.objects.create(title="Index Reset", content=content, source="")
        ingest_document(str(doc.pk))
        reembed_document(str(doc.pk))
        indices = list(
            Chunk.objects.filter(document=doc)
            .order_by("chunk_index")
            .values_list("chunk_index", flat=True)
        )
        assert indices == list(range(len(indices)))


# ---------------------------------------------------------------------------
# .delay() wiring — confirms CELERY_TASK_ALWAYS_EAGER = True is effective
# ---------------------------------------------------------------------------


class TestTaskDelay:
    """Verify task.delay() runs synchronously under CELERY_TASK_ALWAYS_EAGER."""

    @pytest.mark.integration
    @pytest.mark.django_db
    def test_ingest_document_delay_creates_chunks(self, db, fake_embed):
        """ingest_document.delay() runs the task eagerly and returns an EagerResult."""
        doc = Document.objects.create(
            title="Via Delay",
            content="Test sentence for delay invocation.",
            source="",
        )
        async_result = ingest_document.delay(str(doc.pk))
        data = async_result.get()

        assert data["document_id"] == str(doc.pk)
        assert Chunk.objects.filter(document=doc).count() > 0

    @pytest.mark.integration
    @pytest.mark.django_db
    def test_reembed_document_delay_replaces_chunks(self, db, fake_embed):
        """reembed_document.delay() runs eagerly and replaces existing chunks."""
        doc = Document.objects.create(
            title="Via Delay RE",
            content="Test sentence for reembed delay invocation.",
            source="",
        )
        ingest_document(str(doc.pk))
        first_pks = set(Chunk.objects.filter(document=doc).values_list("pk", flat=True))

        async_result = reembed_document.delay(str(doc.pk))
        data = async_result.get()

        assert data["document_id"] == str(doc.pk)
        second_pks = set(
            Chunk.objects.filter(document=doc).values_list("pk", flat=True)
        )
        assert first_pks.isdisjoint(second_pks)

    @pytest.mark.django_db
    def test_delay_exception_propagates_immediately(self, db):
        """CELERY_TASK_EAGER_PROPAGATES ensures task exceptions are not swallowed."""
        with pytest.raises(Document.DoesNotExist):
            ingest_document.delay("00000000-0000-0000-0000-000000000002")
