"""Business logic for document ingestion and similarity search.

The embedding backend is abstracted so it can be swapped out (e.g. for a
stub in tests or a local model in development).
"""

from __future__ import annotations

import os

from pgvector.django import CosineDistance

from .models import Chunk, Document


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------


def chunk_document(content: str, chunk_size: int = 512, overlap: int = 64) -> list[str]:
    """Split *content* into overlapping text segments.

    Splits on sentence boundaries where possible, otherwise falls back to a
    hard word-boundary split.
    """
    if not content:
        return []

    # Split into sentences (naive: split on ". ", "! ", "? ")
    import re

    sentences = re.split(r"(?<=[.!?])\s+", content.strip())

    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for sentence in sentences:
        sentence_len = len(sentence)
        if current_len + sentence_len > chunk_size and current:
            chunks.append(" ".join(current))
            # Keep overlap: drop sentences from the front until we're under overlap
            while current and current_len > overlap:
                removed = current.pop(0)
                current_len -= len(removed) + 1
        current.append(sentence)
        current_len += sentence_len + 1  # +1 for the space

    if current:
        chunks.append(" ".join(current))

    return chunks


# ---------------------------------------------------------------------------
# Embedding backend
# ---------------------------------------------------------------------------

EMBEDDING_DIMENSIONS = int(os.environ.get("EMBEDDING_DIMENSIONS", "1536"))


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Return a list of embedding vectors for *texts*.

    Uses the OpenAI embeddings API by default.  Set ``OPENAI_API_KEY`` in the
    environment to enable real embeddings.

    If the key is absent (e.g. in tests / local dev without a key) a zero
    vector of the correct dimension is returned so the rest of the pipeline
    still works.
    """
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        # Stub: return zero vectors (useful for testing without an API key)
        return [[0.0] * EMBEDDING_DIMENSIONS for _ in texts]

    from openai import OpenAI

    client = OpenAI(api_key=api_key)
    response = client.embeddings.create(
        model=os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-ada-002"),
        input=texts,
    )
    return [item.embedding for item in response.data]


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------


def ingest_document(title: str, content: str, source: str = "") -> Document:
    """Create a Document, chunk it, embed the chunks, and persist everything.

    Returns the saved Document instance.
    """
    document = Document.objects.create(title=title, content=content, source=source)

    text_chunks = chunk_document(content)
    if not text_chunks:
        return document

    vectors = embed_texts(text_chunks)

    Chunk.objects.bulk_create(
        [
            Chunk(
                document=document,
                content=text,
                chunk_index=idx,
                embedding=vector,
            )
            for idx, (text, vector) in enumerate(zip(text_chunks, vectors))
        ]
    )

    return document


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------


def search_similar_chunks(query: str, top_k: int = 5):  # type: ignore[return]
    """Embed *query* and return the *top_k* most similar Chunk objects.

    Results are annotated with a ``distance`` attribute (lower = more similar).
    """
    query_vector = embed_texts([query])[0]
    return (
        Chunk.objects.select_related("document")
        .annotate(distance=CosineDistance("embedding", query_vector))
        .order_by("distance")[:top_k]
    )
