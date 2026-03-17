"""Business logic for document ingestion, similarity search, and RAG generation.

Embedding backend: sentence-transformers (free, local, no API key required).
Generation backend: Anthropic Claude (ANTHROPIC_API_KEY required for RAG).
"""

from __future__ import annotations

import io
import os
import re

import anthropic
from django.core.exceptions import ImproperlyConfigured
from pgvector.django import CosineDistance
from pypdf import PdfReader

from .models import Chunk, Document

# ---------------------------------------------------------------------------
# PDF Extraction
# ---------------------------------------------------------------------------


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract plain text from a PDF byte stream.

    Raises ValueError if the PDF produces no extractable text
    (e.g. scanned image-only PDF with no OCR layer).
    """
    reader = PdfReader(io.BytesIO(file_bytes))
    pages = [page.extract_text() or "" for page in reader.pages]
    text = "\n\n".join(p.strip() for p in pages if p.strip())
    if not text:
        raise ValueError(
            "No extractable text found. The PDF may be scanned or image-only."
        )
    return text


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
# Embedding backend — sentence-transformers (local, free, no API key)
# ---------------------------------------------------------------------------

EMBEDDING_DIMENSIONS = int(os.environ.get("EMBEDDING_DIMENSIONS", "1024"))
_EMBEDDING_MODEL_NAME = os.environ.get("EMBEDDING_MODEL", "BAAI/bge-large-en-v1.5")
_model_singleton = None


def get_embedding_model():
    """Lazy-load and cache the SentenceTransformer model as a module singleton."""
    global _model_singleton  # noqa: PLW0603
    if _model_singleton is None:
        from sentence_transformers import SentenceTransformer

        _model_singleton = SentenceTransformer(_EMBEDDING_MODEL_NAME)
    return _model_singleton


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Return a list of embedding vectors for *texts* using a local model.

    The model is loaded once and kept in memory (singleton).  No API key or
    network call is made after the initial model download.

    In tests, monkeypatch this function to return zero vectors of the correct
    dimension — no HTTP mock is needed since the model runs locally.
    """
    if not texts:
        return []
    model = get_embedding_model()
    vectors = model.encode(texts, convert_to_numpy=True)
    return [v.tolist() for v in vectors]


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
            for idx, (text, vector) in enumerate(zip(text_chunks, vectors, strict=True))
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


# ---------------------------------------------------------------------------
# Generation — Claude via Anthropic API
# ---------------------------------------------------------------------------

_CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-opus-4-5")


def generate_answer(query: str, context_chunks: list[Chunk]) -> str:
    """Generate a grounded answer using Claude with retrieved chunks as context.

    Requires ``ANTHROPIC_API_KEY`` to be set in the environment.
    Raises ``ImproperlyConfigured`` if the key is absent.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise ImproperlyConfigured(
            "ANTHROPIC_API_KEY is not set. "
            "Set it in your environment or .env file to use the RAG endpoint."
        )

    client = anthropic.Anthropic(api_key=api_key)
    context = "\n\n".join(chunk.content for chunk in context_chunks)
    message = client.messages.create(
        model=_CLAUDE_MODEL,
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": f"Context:\n{context}\n\nQuestion: {query}",
            }
        ],
    )
    return message.content[0].text
