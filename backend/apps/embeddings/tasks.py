"""Celery tasks for the embeddings app.

These tasks handle long-running document processing asynchronously so that
the HTTP response is not blocked by embedding model inference.

The Document record (title, source, content) must already exist in the
database before calling either task.

Usage::

    from apps.embeddings.tasks import ingest_document, reembed_document

    # Queue chunking + embedding after creating a Document shell:
    ingest_document.delay(str(document.pk))

    # Re-embed with an updated model or chunk settings:
    reembed_document.delay(str(document.pk))
"""

from __future__ import annotations

import logging

from celery import shared_task

from .models import Chunk, Document
from .services import chunk_document, embed_texts

logger = logging.getLogger(__name__)


@shared_task(bind=True, name="embeddings.ingest_document")
def ingest_document(self, document_id: str) -> dict:  # noqa: ARG001
    """Chunk and embed an existing Document, persisting all Chunk records.

    Any existing chunks for this document are left in place.  Use
    :func:`reembed_document` to replace them.

    Args:
        document_id: Primary key (UUID string) of the Document to process.

    Returns:
        ``{"document_id": str, "chunk_count": int}``

    Raises:
        Document.DoesNotExist: if no Document with the given PK exists.
    """
    document = Document.objects.get(pk=document_id)
    document.status = Document.Status.PROCESSING
    document.save(update_fields=["status"])

    try:
        text_chunks = chunk_document(document.content)
        if not text_chunks:
            logger.info(
                "ingest_document: no chunks produced for document %s", document_id
            )
            document.status = Document.Status.DONE
            document.save(update_fields=["status"])
            return {"document_id": document_id, "chunk_count": 0}

        vectors = embed_texts(text_chunks)
        Chunk.objects.bulk_create(
            [
                Chunk(
                    document=document,
                    content=text,
                    chunk_index=idx,
                    embedding=vector,
                )
                for idx, (text, vector) in enumerate(
                    zip(text_chunks, vectors, strict=True)
                )
            ]
        )
        document.status = Document.Status.DONE
        document.save(update_fields=["status"])
        logger.info(
            "ingest_document: created %d chunks for document %s",
            len(text_chunks),
            document_id,
        )
        return {"document_id": document_id, "chunk_count": len(text_chunks)}
    except Exception as exc:
        document.status = Document.Status.FAILED
        document.save(update_fields=["status"])
        logger.exception(
            "ingest_document: failed for document %s: %s", document_id, exc
        )
        raise


@shared_task(bind=True, name="embeddings.reembed_document")
def reembed_document(self, document_id: str) -> dict:  # noqa: ARG001
    """Delete existing chunks for a Document and re-embed from scratch.

    Useful when the embedding model or chunk size settings have changed.

    Args:
        document_id: Primary key (UUID string) of the Document to re-embed.

    Returns:
        ``{"document_id": str, "chunk_count": int}``

    Raises:
        Document.DoesNotExist: if no Document with the given PK exists.
    """
    document = Document.objects.get(pk=document_id)
    document.status = Document.Status.PROCESSING
    document.save(update_fields=["status"])

    try:
        deleted_count, _ = Chunk.objects.filter(document=document).delete()
        if deleted_count:
            logger.info(
                "reembed_document: deleted %d existing chunks for document %s",
                deleted_count,
                document_id,
            )

        text_chunks = chunk_document(document.content)
        if not text_chunks:
            logger.info(
                "reembed_document: no chunks produced for document %s", document_id
            )
            document.status = Document.Status.DONE
            document.save(update_fields=["status"])
            return {"document_id": document_id, "chunk_count": 0}

        vectors = embed_texts(text_chunks)
        Chunk.objects.bulk_create(
            [
                Chunk(
                    document=document,
                    content=text,
                    chunk_index=idx,
                    embedding=vector,
                )
                for idx, (text, vector) in enumerate(
                    zip(text_chunks, vectors, strict=True)
                )
            ]
        )
        document.status = Document.Status.DONE
        document.save(update_fields=["status"])
        logger.info(
            "reembed_document: created %d chunks for document %s",
            len(text_chunks),
            document_id,
        )
        return {"document_id": document_id, "chunk_count": len(text_chunks)}
    except Exception as exc:
        document.status = Document.Status.FAILED
        document.save(update_fields=["status"])
        logger.exception(
            "reembed_document: failed for document %s: %s", document_id, exc
        )
        raise
