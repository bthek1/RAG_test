---
description: "Use when setting up pgvector for RAG, creating embedding models, writing vector similarity queries, configuring HNSW indexes, or working on the embeddings app. Covers PostgreSQL pgvector extension, Django model patterns, chunking, embedding pipeline, and cosine similarity search."
applyTo: "backend/apps/embeddings/**"
---

# pgvector RAG Database Setup

## Overview

This project uses **PostgreSQL 16 + pgvector** for storing and searching document embeddings.
The RAG pipeline uses **BAAI/bge-large-en-v1.5** (1024-dim, local) for embedding and
**Anthropic Claude** for generation.

---

## PostgreSQL + pgvector

### Docker image

Use the pre-built pgvector image — it includes the pgvector extension already compiled:

```yaml
# docker-compose.yml
services:
  db:
    image: pgvector/pgvector:pg16
    ports:
      - "5434:5432"
    environment:
      POSTGRES_DB: appdb
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD: apppassword
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

### Enabling the extension

pgvector must be enabled once per database. Add this migration (run before any model
migration that uses `VectorField`):

```python
# backend/apps/embeddings/migrations/0001_enable_pgvector.py
from django.db import migrations

class Migration(migrations.Migration):
    dependencies = []

    operations = [
        migrations.RunSQL("CREATE EXTENSION IF NOT EXISTS vector;"),
    ]
```

### Django settings

```python
# DATABASE_URL format (django-environ)
# postgresql+psycopg://user:pass@host:port/dbname
DATABASES = {"default": env.db("DATABASE_URL")}
```

Example `.env`:
```
DATABASE_URL=postgresql+psycopg://appuser:apppassword@localhost:5434/appdb
```

---

## Django Models

### Required packages

```toml
# pyproject.toml (uv)
pgvector = ">=0.3"
psycopg = {extras = ["binary"]}   # psycopg3
```

### Import pattern

```python
from pgvector.django import HnswIndex, VectorField
```

### Document model (status FSM)

```python
import uuid
from django.db import models

class Document(models.Model):
    class Status(models.TextChoices):
        PENDING    = "pending",    "Pending"
        PROCESSING = "processing", "Processing"
        DONE       = "done",       "Done"
        FAILED     = "failed",     "Failed"

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title      = models.CharField(max_length=512)
    source     = models.TextField(blank=True)   # URL or original file path
    content    = models.TextField()             # full extracted text
    status     = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

Status transitions: `PENDING → PROCESSING → DONE | FAILED`

### Chunk model (vector storage)

```python
class Chunk(models.Model):
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document    = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="chunks")
    content     = models.TextField()
    chunk_index = models.PositiveIntegerField()        # position within the document
    embedding   = VectorField(dimensions=1024)         # BAAI/bge-large-en-v1.5 output

    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["document", "chunk_index"]
        indexes = [
            HnswIndex(
                fields=["embedding"],
                name="chunk_embedding_hnsw_idx",
                m=16,                             # graph connectivity (higher = better recall, slower build)
                ef_construction=64,               # build-time quality (higher = better recall, slower build)
                opclasses=["vector_cosine_ops"],  # cosine distance
            ),
        ]
```

**Why HNSW over IVFFlat:**
- HNSW builds incrementally — works on empty tables without needing a training step
- Higher recall at query time
- IVFFlat requires `VACUUM` / training with existing data before use

**Dimension must match the embedding model** — `BAAI/bge-large-en-v1.5` outputs 1024-dim.
If you switch models, update `dimensions=` here and re-embed all documents.

---

## Embedding Model

### Configuration (settings)

```python
import os

EMBEDDING_MODEL  = os.environ.get("EMBEDDING_MODEL", "BAAI/bge-large-en-v1.5")
EMBEDDING_DEVICE = os.environ.get("EMBEDDING_DEVICE", None)   # None = auto-detect CUDA/MPS/CPU
HF_HOME          = os.environ.get("HF_HOME", "/models/huggingface")
```

Set `HF_HOME` to a persistent directory so the model is not re-downloaded on every container restart.
In Docker Compose, mount `./models:/models` and set `HF_HOME=/models/huggingface`.

### Singleton loader (services.py pattern)

```python
from sentence_transformers import SentenceTransformer
import torch

_model_singleton: SentenceTransformer | None = None

def _get_model() -> SentenceTransformer:
    global _model_singleton
    if _model_singleton is None:
        device = settings.EMBEDDING_DEVICE
        if device is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
        _model_singleton = SentenceTransformer(
            settings.EMBEDDING_MODEL,
            cache_folder=settings.HF_HOME,
            device=device,
        )
    return _model_singleton

def embed_texts(texts: list[str]) -> list[list[float]]:
    model = _get_model()
    return model.encode(texts, normalize_embeddings=True).tolist()
```

Use `normalize_embeddings=True` — required for cosine similarity via dot product.

---

## Chunking Strategy

```python
import re

def chunk_document(content: str, chunk_size: int = 512, overlap: int = 64) -> list[str]:
    """Sentence-aware chunker with sliding overlap."""
    sentences = re.split(r"(?<=[.!?])\s+", content.strip())
    chunks: list[str] = []
    current = ""

    for sentence in sentences:
        if len(current) + len(sentence) + 1 > chunk_size and current:
            chunks.append(current.strip())
            # keep last `overlap` characters as context for the next chunk
            current = current[-overlap:] + " " + sentence
        else:
            current = (current + " " + sentence).strip()

    if current:
        chunks.append(current.strip())

    return chunks
```

- `chunk_size=512` chars is a good default for `bge-large-en-v1.5` (512 token limit)
- `overlap=64` chars preserves sentence context across chunk boundaries

---

## Similarity Search

```python
from pgvector.django import CosineDistance

def search_similar_chunks(query: str, top_k: int = 5) -> list[Chunk]:
    query_vector = embed_texts([query])[0]
    return (
        Chunk.objects
        .select_related("document")
        .annotate(distance=CosineDistance("embedding", query_vector))
        .filter(document__status=Document.Status.DONE)
        .order_by("distance")[:top_k]
    )
```

**Distance semantics (cosine):** `0` = identical, `1` = orthogonal, `2` = opposite.
Results are ordered ascending — lowest distance = most similar.

---

## Celery Ingestion Tasks

Tasks live in `apps/embeddings/tasks.py` and are auto-discovered via `core/celery.py`.

```python
from celery import shared_task
from .models import Document
from .services import chunk_document, embed_texts
from .models import Chunk

@shared_task(bind=True, name="embeddings.ingest_document")
def ingest_document(self, document_id: str) -> dict:
    doc = Document.objects.get(pk=document_id)
    doc.status = Document.Status.PROCESSING
    doc.save(update_fields=["status"])
    try:
        text_chunks = chunk_document(doc.content)
        vectors = embed_texts(text_chunks)
        Chunk.objects.filter(document=doc).delete()
        Chunk.objects.bulk_create([
            Chunk(document=doc, content=text, chunk_index=i, embedding=vec)
            for i, (text, vec) in enumerate(zip(text_chunks, vectors))
        ])
        doc.status = Document.Status.DONE
        doc.save(update_fields=["status"])
        return {"chunks": len(text_chunks)}
    except Exception as exc:
        doc.status = Document.Status.FAILED
        doc.save(update_fields=["status"])
        raise

@shared_task(bind=True, name="embeddings.reembed_document")
def reembed_document(self, document_id: str) -> dict:
    """Re-embed an existing document (use after changing the embedding model)."""
    Chunk.objects.filter(document_id=document_id).delete()
    return ingest_document(document_id)
```

**Always use `bulk_create`** for inserting chunks — do not loop with individual `.save()` calls.

---

## Migration Order

1. `0001_enable_pgvector.py` — `CREATE EXTENSION IF NOT EXISTS vector`
2. `0002_initial.py` — creates `Document` and `Chunk` tables
3. `0003_chunk_embedding_hnsw_idx.py` — adds HNSW index (may be auto-generated by Django)

Run after any model change:
```bash
just be-makemigrations embeddings
just be-migrate
```

---

## Environment Variables Reference

| Variable | Default | Required |
|---|---|---|
| `DATABASE_URL` | — | Yes |
| `EMBEDDING_MODEL` | `BAAI/bge-large-en-v1.5` | No |
| `EMBEDDING_DEVICE` | auto-detect | No |
| `HF_HOME` | `/models/huggingface` | No (but set it) |
| `ANTHROPIC_API_KEY` | — | Yes (for RAG generation) |
| `CLAUDE_MODEL` | `claude-opus-4-5` | No |
| `CELERY_BROKER_URL` | `redis://localhost:6379/0` | Yes (Celery) |

---

## Common Mistakes

| Mistake | Fix |
|---|---|
| Forgetting `CREATE EXTENSION vector` migration | Add `0001_enable_pgvector` before the initial models migration |
| `VectorField` dimensions don't match model output | Must equal `model.get_sentence_embedding_dimension()` |
| Using IVFFlat on empty table | Use HNSW — IVFFlat needs data before building index |
| Re-downloading model on every deploy | Mount `./models:/models` + set `HF_HOME` in Docker Compose |
| Single `.save()` calls in a loop | Use `bulk_create()` with a list |
| Forgetting `normalize_embeddings=True` | Required for correct cosine similarity |
