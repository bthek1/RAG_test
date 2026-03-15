# Plan: RAG Implementation

**Status:** Complete  
**Date:** 2026-03-15

---

## Goal

Implement a full Retrieval-Augmented Generation (RAG) pipeline on top of the existing Django + PostgreSQL stack. The system will:

1. **Ingest** source documents — chunk text, embed each chunk with a free local model, and store vectors in PostgreSQL via pgvector.
2. **Retrieve** the most semantically relevant chunks for a given query using HNSW approximate nearest-neighbour search.
3. **Generate** a grounded answer by passing the retrieved context to Claude (Anthropic) and returning the response to the caller.

This gives the application a production-quality, cost-efficient RAG pipeline with zero embedding cost (local `sentence-transformers`) and Claude as the LLM.

---

## Background

The repo is named `RAG_test`, so a working RAG pipeline is the primary deliverable.  
pgvector runs inside the existing Postgres container and is accessed via the Django ORM using the `pgvector` Python package. Embeddings are generated locally by `sentence-transformers` (free, no API key). Generation is handled by Claude via the Anthropic API. No separate vector database or embedding service is needed.

Current state:
- DB: `postgres:16` Docker image (no pgvector preinstalled)
- No embeddings model, no document/chunk models, no similarity-search endpoints, no generation endpoint
- Python packages in `pyproject.toml` contain no vector or Anthropic dependencies

**Embedding strategy:** Free, local embeddings via `sentence-transformers` — no API key required, no per-call cost. The LLM for generation is Claude (Anthropic); embeddings are a separate concern and do not require an Anthropic API. The chosen embedding model is `BAAI/bge-large-en-v1.5` (1024 dimensions) — highest quality in the BGE family, runs locally via `sentence-transformers`.

**Index strategy:** HNSW (Hierarchical Navigable Small World) — chosen over IVFFlat for its high recall at all dataset sizes, faster query performance, and no requirement to pre-populate the table before the index is useful.

---

## Phases

### Phase 1 — Infrastructure: Docker + Extension + Python Package

- [x] Change the `db` Docker image from `postgres:16` to `pgvector/pgvector:pg16` in `docker-compose.yml`
- [x] Add `pgvector ~=0.3`, `sentence-transformers>=3.0`, and `anthropic>=0.25` to `backend/pyproject.toml` runtime dependencies
- [x] Run `uv sync` to lock the new dependencies
- [x] Create a Django data migration in an existing or new app that runs `CREATE EXTENSION IF NOT EXISTS vector` — this must run before any model migration that uses `VectorField`
- [x] Verify the extension is available: `just up && just be-migrate` should complete without errors

### Phase 2 — New Django App: `embeddings`

Create `backend/apps/embeddings/` as the dedicated domain for all vector-related models and logic.

- [x] Scaffold the app: `just be-startapp embeddings`
- [x] Register `apps.embeddings` in `INSTALLED_APPS` in `core/settings/base.py`
- [x] Define models in `apps/embeddings/models.py`:

  **`Document`** — represents a source document (file, URL, raw text):
  ```python
  class Document(models.Model):
      id          = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
      title       = CharField(max_length=512)
      source      = TextField(blank=True)         # URL or file path
      content     = TextField()                   # raw full text
      created_at  = DateTimeField(auto_now_add=True)
      updated_at  = DateTimeField(auto_now=True)
  ```

  **`Chunk`** — a text segment from a document with its embedding:
  ```python
  from pgvector.django import VectorField

  class Chunk(models.Model):
      id          = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
      document    = ForeignKey(Document, on_delete=CASCADE, related_name="chunks")
      content     = TextField()
      chunk_index = PositiveIntegerField()        # position within the document
      embedding   = VectorField(dimensions=1024)  # bge-large-en-v1.5 (1024-dim); set via EMBEDDING_DIMENSIONS env var
      created_at  = DateTimeField(auto_now_add=True)

      class Meta:
          ordering = ["document", "chunk_index"]
          indexes  = [HnswIndex(fields=["embedding"], name="chunk_embedding_hnsw_idx", m=16, ef_construction=64, opclasses=["vector_cosine_ops"])]
  ```

- [x] Generate and apply migrations: `just be-makemigrations embeddings && just be-migrate`
- [x] Register models in `apps/embeddings/admin.py`

> **Embedding dimensions** are model-dependent and controlled by the `EMBEDDING_DIMENSIONS` env var (default `1024`). Current model: `BAAI/bge-large-en-v1.5` (1024 dims). Alternative free models: `bge-base-en-v1.5` (768), `bge-small-en-v1.5` (384), `all-MiniLM-L6-v2` (384) — all run locally via `sentence-transformers`. Import `HnswIndex` from `pgvector.django`.

### Phase 3 — Vector Index

pgvector supports two index types:

| Index | Best for | Setting |
|---|---|---|
| `IVFFlat` | > 100k vectors, approximate recall | `lists` ≈ `sqrt(row_count)`; requires pre-populated table |
| **`HNSW`** ✅ **chosen** | High recall at all sizes, faster queries, no pre-population needed | `m=16, ef_construction=64` |

- [x] Use `HnswIndex` from `pgvector.django` in `Chunk.Meta.indexes` with `opclasses=["vector_cosine_ops"]` for cosine similarity
- [x] Document the index choice and tuning guidance in `docs/explanations/pgvector.md`
- [x] HNSW advantages over IVFFlat: works on empty tables (index is built incrementally), higher recall, no `lists` tuning required, queries do not degrade if `ef_search` is not set
- [x] Tuning knobs: `m` (connectivity, default 16) and `ef_construction` (build-time quality, default 64); increase `ef_search` at query time for higher recall at the cost of speed

### Phase 4 — Services Layer

Business logic lives in `apps/embeddings/services.py` — **no** logic in views.

- [x] `chunk_document(content: str, chunk_size: int = 512, overlap: int = 64) -> list[str]`  
  Simple sliding-window chunker. Splits on sentence boundaries where possible.

- [x] `get_embedding_model() -> SentenceTransformer`  
  Lazy-loads the `sentence-transformers` model specified by `EMBEDDING_MODEL` env var (default `BAAI/bge-large-en-v1.5`). Cached as a module-level singleton to avoid reloading on every request.

- [x] `embed_texts(texts: list[str]) -> list[list[float]]`  
  Encodes texts using the local `SentenceTransformer` model — **no API call, no cost**. Returns a list of float vectors. For tests, monkeypatch this function to return zero vectors of the correct dimension; no network mock needed.

- [x] `ingest_document(title: str, content: str, source: str = "") -> Document`  
  Orchestrates: create `Document` → chunk → embed → bulk-create `Chunk` records.

- [x] `search_similar_chunks(query: str, top_k: int = 5) -> QuerySet[Chunk]`  
  Embeds the query locally, then queries with cosine distance using the HNSW index:
  ```python
  from pgvector.django import CosineDistance
  Chunk.objects.annotate(distance=CosineDistance("embedding", query_vec))
              .order_by("distance")[:top_k]
  ```

- [x] Add `EMBEDDING_MODEL` (default `BAAI/bge-large-en-v1.5`) and `EMBEDDING_DIMENSIONS` (default `1024`) to `backend/.env.example`
- [x] Add `ANTHROPIC_API_KEY` to `backend/.env.example` (used by the generation layer calling Claude; not needed by the embeddings service itself)

### Phase 5 — API Endpoints (Retrieval)

Register under `/api/embeddings/` in `apps/embeddings/urls.py` and include in `core/urls.py`.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/embeddings/documents/` | Bearer | Ingest a new document (triggers chunking + embedding) |
| `GET` | `/api/embeddings/documents/` | Bearer | List documents (paginated) |
| `GET` | `/api/embeddings/documents/{id}/` | Bearer | Get document + chunk count |
| `DELETE` | `/api/embeddings/documents/{id}/` | Bearer | Delete document and all its chunks |
| `POST` | `/api/embeddings/search/` | Bearer | Similarity search — returns top-k chunks with distance score |

Request/response shapes to be documented in `docs/standards/api-contracts.md` once finalised.

- [x] `DocumentSerializer` in `serializers.py`
- [x] `ChunkSerializer` in `serializers.py` (read-only; chunks are created by the service)
- [x] `DocumentListCreateView` (`generics.ListCreateAPIView`)
- [x] `DocumentDetailView` (`generics.RetrieveDestroyAPIView`)
- [x] `SimilaritySearchView` (`APIView`) — accepts `{"query": "...", "top_k": 5}`
- [x] Wire URLs and add to `core/urls.py`

### Phase 7 — Generation Layer (Claude)

Add Claude-powered answer generation to `apps/embeddings/services.py`.

- [x] `generate_answer(query: str, context_chunks: list[Chunk]) -> str`  
  Builds a prompt that includes the retrieved chunk content as context and calls the Anthropic API:
  ```python
  import anthropic

  def generate_answer(query: str, context_chunks: list[Chunk]) -> str:
      client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env
      context = "\n\n".join(chunk.content for chunk in context_chunks)
      message = client.messages.create(
          model="claude-opus-4-5",
          max_tokens=1024,
          messages=[
              {
                  "role": "user",
                  "content": f"Context:\n{context}\n\nQuestion: {query}",
              }
          ],
      )
      return message.content[0].text
  ```
- [x] Model configurable via `CLAUDE_MODEL` env var (default `claude-opus-4-5`)
- [x] `ANTHROPIC_API_KEY` is required; raise `ImproperlyConfigured` on startup if missing
- [x] Add `ANTHROPIC_API_KEY` and `CLAUDE_MODEL` to `backend/.env.example`

### Phase 8 — RAG Endpoint

Add a single end-to-end RAG endpoint that retrieves relevant chunks and generates an answer.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/embeddings/rag/` | Bearer | Full RAG: retrieve top-k chunks + generate Claude answer |

**Request:**
```json
{ "query": "What is ...", "top_k": 5 }
```

**Response:**
```json
{
  "answer": "...",
  "sources": [
    { "chunk_id": "uuid", "document_title": "...", "content": "...", "distance": 0.12 }
  ]
}
```

- [x] `RAGView` (`APIView`) in `views.py` — calls `search_similar_chunks` then `generate_answer`
- [x] `RAGResponseSerializer` for the response shape
- [x] Add route to `apps/embeddings/urls.py`
- [x] Document endpoint in `docs/standards/api-contracts.md`

### Phase 6 — Testing

- [x] Unit test `chunk_document`: boundary cases, overlap, empty input
- [x] Unit test `embed_texts`: monkeypatch `SentenceTransformer.encode` to return a fixed numpy array; verify shape and dtype of returned vectors — no HTTP mock needed since embeddings are local
- [x] Unit test `generate_answer`: mock `anthropic.Anthropic().messages.create` to return a fixed response; verify prompt construction includes context chunks
- [x] Unit test `search_similar_chunks`: integration tests in `test_models.py` — marked `@pytest.mark.integration`; use `fake_embed` fixture to patch embeddings
- [x] Integration tests for all API endpoints using `APIClient` (retrieval endpoints + RAG endpoint)
- [x] Factory: `DocumentFactory`, `ChunkFactory` (random unit-length float vector) in `tests/factories.py`
- [x] Mark pgvector-dependent tests with `@pytest.mark.integration` so they can be skipped in CI without a live DB

---

## Testing

**Unit tests** (no DB):
- `chunk_document` logic — pure Python, no ORM
- `embed_texts` — monkeypatch `SentenceTransformer.encode`
- `generate_answer` — mock Anthropic client

**Integration tests** (require live Postgres + pgvector extension):
- Model creation and vector persistence
- `HnswIndex` is created and is used for cosine similarity searches
- End-to-end ingest → search pipeline (with monkeypatched embedder for speed)

**Manual verification:**
1. `just up` — postgres container starts from `pgvector/pgvector:pg16`
2. `just be-migrate` — extension migration and model migrations apply cleanly
3. `POST /api/embeddings/documents/` — confirm document is ingested and chunks are stored
4. `POST /api/embeddings/search/` — confirm ranked chunk results are returned
5. `POST /api/embeddings/rag/` — confirm a grounded Claude answer is returned along with source chunks

---

## Risks & Notes

- **Test settings use SQLite** (`core/settings/test.py`). `VectorField` and `pgvector` functions are Postgres-only. Integration tests must target a Postgres test database. Options:
  - Add a `DATABASES` override in `test.py` that targets a test Postgres DB (e.g. `test_appdb`) — this requires the pgvector-enabled Postgres to be running
  - Alternatively, use `pytest-docker` / `testcontainers-python` to spin up a pgvector Postgres container for CI

- **Embedding cost**: Zero — `sentence-transformers` runs the model locally. No API key, no per-call cost. Model weights (~1.3 GB for `bge-large-en-v1.5`) are downloaded once on first use and cached by HuggingFace. In Docker, pre-download the model weights into the image to avoid cold-start latency. A GPU is not required but will significantly speed up bulk ingestion.

- **Claude API cost**: The Anthropic API is used only for generation (`/api/embeddings/rag/`). Retrieval and ingestion make no external calls. Mock the Anthropic client in all tests to avoid accidental charges.

- **Claude integration**: `generate_answer` in `services.py` wraps `anthropic.Anthropic().messages.create`. The model is configurable via `CLAUDE_MODEL` env var. The service must raise `django.core.exceptions.ImproperlyConfigured` on startup if `ANTHROPIC_API_KEY` is not set.

- **HNSW vs IVFFlat**: HNSW was chosen. Unlike IVFFlat, HNSW builds incrementally and requires no table pre-population, making it safe to create in the initial migration. `m=16, ef_construction=64` are sensible defaults; increase `ef_construction` for higher recall at the cost of slower index builds.

- **Dimension mismatch**: If the embedding model changes after data is already stored, existing vectors are incompatible. Plan for a re-embedding migration if the model ever changes. The `EMBEDDING_DIMENSIONS` env var must match the model in use.

- **`drf-spectacular`** is referenced in `copilot-instructions.md` but not yet in `pyproject.toml`. Adding it alongside this work would enable auto-generated API docs for the new endpoints.
