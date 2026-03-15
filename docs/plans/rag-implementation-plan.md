# Plan: RAG Implementation

**Status:** Draft  
**Date:** 2026-03-15

---

## Goal

Implement a full Retrieval-Augmented Generation (RAG) pipeline on top of the existing Django + PostgreSQL stack. The system will:

1. **Ingest** source documents — chunk text with Haystack's `DocumentSplitter`, embed each chunk with Haystack's `SentenceTransformersDocumentEmbedder`, and store vectors in PostgreSQL via pgvector using the Django ORM.
2. **Retrieve** the most semantically relevant chunks for a given query using HNSW approximate nearest-neighbour search via the Django ORM (pgvector).
3. **Generate** a grounded answer by building a prompt with Haystack's `PromptBuilder` and generating with Haystack's `AnthropicChatGenerator` (Claude), returning the response to the caller.

This gives the application a production-quality, cost-efficient RAG pipeline with zero embedding cost (local `sentence-transformers`) and Claude as the LLM.

**Architecture principle:** Use Haystack for what it is good at — chunking, embedding pipeline, prompt building, and LLM generation. Keep Django in charge of storage — Django ORM owns the `Document` and `Chunk` models, migrations, and all database reads/writes. It Haystack components are used as stateless processing tools within `services.py`; they never touch the database directly.

---

## Background

The repo is named `RAG_test`, so a working RAG pipeline is the primary deliverable.  
pgvector runs inside the existing Postgres container and is accessed via the Django ORM using the `pgvector` Python package. Embeddings are generated locally by Haystack's `SentenceTransformersDocumentEmbedder` (wrapping `sentence-transformers` — free, no API key). Generation is handled by Haystack's `AnthropicChatGenerator` (Claude). No separate vector database or embedding service is needed.

Current state:
- DB: `postgres:16` Docker image (no pgvector preinstalled)
- No embeddings model, no document/chunk models, no similarity-search endpoints, no generation endpoint
- Python packages in `pyproject.toml` contain no vector, Haystack, or Anthropic dependencies

**Embedding strategy:** Free, local embeddings via Haystack's `SentenceTransformersDocumentEmbedder` — no API key required, no per-call cost. The LLM for generation is Claude (Anthropic), invoked through Haystack's `AnthropicChatGenerator`. The chosen embedding model is `BAAI/bge-large-en-v1.5` (1024 dimensions) — highest quality in the BGE family.

**Index strategy:** HNSW (Hierarchical Navigable Small World) — chosen over IVFFlat for its high recall at all dataset sizes, faster query performance, and no requirement to pre-populate the table before the index is useful.

---

## Phases

### Phase 1 — Infrastructure: Docker + Extension + Python Packages

- [ ] Change the `db` Docker image from `postgres:16` to `pgvector/pgvector:pg16` in `docker-compose.yml`
- [ ] Add the following to `backend/pyproject.toml` runtime dependencies:
  - `pgvector ~=0.3` — Django ORM integration for `VectorField` and `CosineDistance`
  - `haystack-ai>=2.0` — core Haystack v2 framework
  - `sentence-transformers>=3.0` — used by Haystack's `SentenceTransformersDocumentEmbedder` / `SentenceTransformersTextEmbedder`
  - `haystack-experimental` (optional) — extra components if needed
  - `anthropic>=0.25` — required by Haystack's `AnthropicChatGenerator`
- [ ] Run `uv sync` to lock the new dependencies
- [ ] Create a Django data migration in an existing or new app that runs `CREATE EXTENSION IF NOT EXISTS vector` — this must run before any model migration that uses `VectorField`
- [ ] Verify the extension is available: `just up && just be-migrate` should complete without errors

### Phase 2 — New Django App: `embeddings`

Create `backend/apps/embeddings/` as the dedicated domain for all vector-related models and logic.

- [ ] Scaffold the app: `just be-startapp embeddings`
- [ ] Register `apps.embeddings` in `INSTALLED_APPS` in `core/settings/base.py`
- [ ] Define models in `apps/embeddings/models.py`:

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

- [ ] Generate and apply migrations: `just be-makemigrations embeddings && just be-migrate`
- [ ] Register models in `apps/embeddings/admin.py`

> **Embedding dimensions** are model-dependent and controlled by the `EMBEDDING_DIMENSIONS` env var (default `1024`). Current model: `BAAI/bge-large-en-v1.5` (1024 dims). Alternative free models: `bge-base-en-v1.5` (768), `bge-small-en-v1.5` (384), `all-MiniLM-L6-v2` (384) — all run locally via `sentence-transformers`. Import `HnswIndex` from `pgvector.django`.

### Phase 3 — Vector Index

pgvector supports two index types:

| Index | Best for | Setting |
|---|---|---|
| `IVFFlat` | > 100k vectors, approximate recall | `lists` ≈ `sqrt(row_count)`; requires pre-populated table |
| **`HNSW`** ✅ **chosen** | High recall at all sizes, faster queries, no pre-population needed | `m=16, ef_construction=64` |

- [ ] Use `HnswIndex` from `pgvector.django` in `Chunk.Meta.indexes` with `opclasses=["vector_cosine_ops"]` for cosine similarity
- [ ] Document the index choice and tuning guidance in `docs/explanations/pgvector.md`
- [ ] HNSW advantages over IVFFlat: works on empty tables (index is built incrementally), higher recall, no `lists` tuning required, queries do not degrade if `ef_search` is not set
- [ ] Tuning knobs: `m` (connectivity, default 16) and `ef_construction` (build-time quality, default 64); increase `ef_search` at query time for higher recall at the cost of speed

### Phase 4 — Services Layer

Business logic lives in `apps/embeddings/services.py` — **no** logic in views. Haystack components are used as stateless processing tools; Django ORM handles all persistence.

#### Haystack component responsibilities

| Responsibility | Haystack component |
|---|---|
| Chunking | `DocumentSplitter` (`split_by="sentence"`, `split_length=10`, `split_overlap=2`) |
| Document embedding (ingest) | `SentenceTransformersDocumentEmbedder(model="BAAI/bge-large-en-v1.5")` |
| Query embedding (search) | `SentenceTransformersTextEmbedder(model="BAAI/bge-large-en-v1.5")` |
| Prompt building (generation) | `PromptBuilder(template=RAG_PROMPT_TEMPLATE)` |
| LLM generation | `AnthropicChatGenerator(model="claude-opus-4-5")` |

Haystack components are **never** given a document store — Django ORM is the only store.

#### Service functions

- [ ] `get_document_splitter() -> DocumentSplitter`  
  Returns a lazily-initialised Haystack `DocumentSplitter` configured via `CHUNK_SPLIT_BY` (default `"sentence"`), `CHUNK_SPLIT_LENGTH` (default `10`), and `CHUNK_SPLIT_OVERLAP` (default `2`) env vars. Cached as a module-level singleton.

- [ ] `get_document_embedder() -> SentenceTransformersDocumentEmbedder`  
  Returns a lazily-initialised Haystack `SentenceTransformersDocumentEmbedder` using the model from `EMBEDDING_MODEL` env var (default `BAAI/bge-large-en-v1.5`). Cached as a module-level singleton.

- [ ] `get_text_embedder() -> SentenceTransformersTextEmbedder`  
  Returns a lazily-initialised Haystack `SentenceTransformersTextEmbedder` using the same model. Cached as a module-level singleton.

- [ ] `ingest_document(title: str, content: str, source: str = "") -> Document`  
  Orchestrates: create Django `Document` → wrap content in Haystack `Document` objects → run `DocumentSplitter` → run `SentenceTransformersDocumentEmbedder` → bulk-create Django `Chunk` records from the embedded Haystack documents. Haystack is used only for splitting and embedding; Django ORM performs the actual DB writes.
  ```python
  from haystack import Document as HaystackDocument
  from haystack.components.preprocessors import DocumentSplitter
  from haystack.components.embedders import SentenceTransformersDocumentEmbedder

  def ingest_document(title: str, content: str, source: str = "") -> Document:
      doc = Document.objects.create(title=title, content=content, source=source)
      hs_docs = [HaystackDocument(content=content)]
      splitter = get_document_splitter()
      splitter.warm_up()
      split_result = splitter.run(documents=hs_docs)
      embedder = get_document_embedder()
      embedder.warm_up()
      embedded = embedder.run(documents=split_result["documents"])
      Chunk.objects.bulk_create([
          Chunk(
              document=doc,
              content=hs_doc.content,
              chunk_index=i,
              embedding=hs_doc.embedding,
          )
          for i, hs_doc in enumerate(embedded["documents"])
      ])
      return doc
  ```

- [ ] `search_similar_chunks(query: str, top_k: int = 5) -> QuerySet[Chunk]`  
  Embeds the query with Haystack's `SentenceTransformersTextEmbedder`, then queries Django ORM with cosine distance using the HNSW index:
  ```python
  from pgvector.django import CosineDistance
  from haystack.components.embedders import SentenceTransformersTextEmbedder

  def search_similar_chunks(query: str, top_k: int = 5):
      embedder = get_text_embedder()
      embedder.warm_up()
      result = embedder.run(text=query)
      query_vec = result["embedding"]
      return (
          Chunk.objects.annotate(distance=CosineDistance("embedding", query_vec))
              .order_by("distance")[:top_k]
      )
  ```

- [ ] `generate_answer(query: str, context_chunks: list[Chunk]) -> str`  
  Builds the prompt with Haystack's `PromptBuilder` and generates the answer with Haystack's `AnthropicChatGenerator`:
  ```python
  from haystack.components.builders import PromptBuilder
  from haystack_integrations.components.generators.anthropic import AnthropicChatGenerator
  from haystack.dataclasses import ChatMessage

  RAG_PROMPT_TEMPLATE = """
  Given the following context, answer the question.

  Context:
  {% for chunk in chunks %}
  {{ chunk.content }}
  {% endfor %}

  Question: {{ query }}
  Answer:
  """

  def generate_answer(query: str, context_chunks: list[Chunk]) -> str:
      builder = PromptBuilder(template=RAG_PROMPT_TEMPLATE)
      prompt_result = builder.run(chunks=context_chunks, query=query)
      generator = AnthropicChatGenerator(
          model=settings.CLAUDE_MODEL,
      )
      messages = [ChatMessage.from_user(prompt_result["prompt"])]
      result = generator.run(messages=messages)
      return result["replies"][0].text
  ```
- [ ] Model configurable via `CLAUDE_MODEL` env var (default `claude-opus-4-5`)
- [ ] `ANTHROPIC_API_KEY` is required by `AnthropicChatGenerator`; raise `ImproperlyConfigured` on startup if missing
- [ ] Add `EMBEDDING_MODEL` (default `BAAI/bge-large-en-v1.5`) and `EMBEDDING_DIMENSIONS` (default `1024`) to `backend/.env.example`
- [ ] Add `ANTHROPIC_API_KEY` and `CLAUDE_MODEL` to `backend/.env.example`

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

- [ ] `DocumentSerializer` in `serializers.py`
- [ ] `ChunkSerializer` in `serializers.py` (read-only; chunks are created by the service)
- [ ] `DocumentListCreateView` (`generics.ListCreateAPIView`)
- [ ] `DocumentDetailView` (`generics.RetrieveDestroyAPIView`)
- [ ] `SimilaritySearchView` (`APIView`) — accepts `{"query": "...", "top_k": 5}`
- [ ] Wire URLs and add to `core/urls.py`

### Phase 7 — Generation Layer (Claude via Haystack)

Generation is handled by Haystack's `AnthropicChatGenerator` and `PromptBuilder` in `apps/embeddings/services.py`. See Phase 4 for the full `generate_answer` implementation.

Key points:
- `PromptBuilder` renders a Jinja2 template — context chunks and query are injected as template variables; no manual string concatenation
- `AnthropicChatGenerator` wraps the Anthropic SDK — model is set via `CLAUDE_MODEL` env var (default `claude-opus-4-5`)
- `ANTHROPIC_API_KEY` must be present in the environment; `AnthropicChatGenerator` will raise if it is missing
- All generation tests mock the `AnthropicChatGenerator.run()` method — no Anthropic SDK calls in tests
- [ ] Add `ANTHROPIC_API_KEY` and `CLAUDE_MODEL` to `backend/.env.example` (already covered in Phase 4)

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

- [ ] `RAGView` (`APIView`) in `views.py` — calls `search_similar_chunks` then `generate_answer`
- [ ] `RAGResponseSerializer` for the response shape
- [ ] Add route to `apps/embeddings/urls.py`
- [ ] Document endpoint in `docs/standards/api-contracts.md`

### Phase 6 — Testing

- [ ] Unit test chunking: use a real Haystack `DocumentSplitter` instance (no DB required); test boundary cases, overlap, empty input
- [ ] Unit test `ingest_document`: monkeypatch `SentenceTransformersDocumentEmbedder.run` to return fixed-dimension vectors; verify `Chunk` records are created with correct content and chunk indices — no real model load, no HTTP call
- [ ] Unit test `search_similar_chunks`: monkeypatch `SentenceTransformersTextEmbedder.run` to return a fixed embedding vector; verify the Django ORM query runs and results are ordered by distance
- [ ] Unit test `generate_answer`: mock `AnthropicChatGenerator.run` to return a fixed `ChatMessage`; verify `PromptBuilder` receives chunks and query; verify the returned string matches the mocked reply
- [ ] Integration tests for all API endpoints using `APIClient` (retrieval endpoints + RAG endpoint)
- [ ] Factory: `DocumentFactory`, `ChunkFactory` (random float vector via `faker`)
- [ ] Mark pgvector-dependent tests with `@pytest.mark.integration` so they can be skipped in CI without a live DB

---

## Testing

**Unit tests** (no DB, no model loaded):
- Chunking via Haystack `DocumentSplitter` — pure component, no ORM
- `ingest_document` — monkeypatch `SentenceTransformersDocumentEmbedder.run`
- `search_similar_chunks` — monkeypatch `SentenceTransformersTextEmbedder.run`
- `generate_answer` — mock `AnthropicChatGenerator.run`; verify `PromptBuilder` output includes chunks and query

**Integration tests** (require live Postgres + pgvector extension):
- Model creation and vector persistence
- `HnswIndex` is built and used for cosine similarity searches
- End-to-end ingest → search pipeline (with monkeypatched embedder for speed)

**Manual verification:**
1. `just up` — postgres container starts from `pgvector/pgvector:pg16`
2. `just be-migrate` — extension migration and model migrations apply cleanly
3. `POST /api/embeddings/documents/` — confirm document is ingested and chunks are stored
4. `POST /api/embeddings/search/` — confirm ranked chunk results are returned
5. `POST /api/embeddings/rag/` — confirm a grounded Claude answer is returned along with source chunks

---

## Risks & Notes

- **Haystack / Django boundary**: Haystack components (`DocumentSplitter`, embedders, `PromptBuilder`, `AnthropicChatGenerator`) are used as stateless processing tools inside `services.py`. They are never given a Haystack document store — Django ORM is the only store. This keeps migrations, transactions, and data ownership entirely within Django.

- **Haystack component warm-up**: Haystack v2 components that load models must call `.warm_up()` before `.run()`. The singleton pattern in `get_document_embedder()` / `get_text_embedder()` handles this once per process lifetime.

- **Test settings use SQLite** (`core/settings/test.py`). `VectorField` and `pgvector` functions are Postgres-only. Integration tests must target a Postgres test database. Options:
  - Add a `DATABASES` override in `test.py` that targets a test Postgres DB (e.g. `test_appdb`) — this requires the pgvector-enabled Postgres to be running
  - Alternatively, use `pytest-docker` / `testcontainers-python` to spin up a pgvector Postgres container for CI

- **Embedding cost**: Zero — Haystack's `SentenceTransformersDocumentEmbedder` runs the model locally via `sentence-transformers`. No API key, no per-call cost. Model weights (~1.3 GB for `bge-large-en-v1.5`) are downloaded once and cached by HuggingFace. In Docker, pre-download the model weights into the image to avoid cold-start latency. A GPU is not required but will significantly speed up bulk ingestion.

- **Claude API cost**: The Anthropic API is used only for generation (`/api/embeddings/rag/`). Retrieval and ingestion make no external calls. Mock `AnthropicChatGenerator.run` in all tests to avoid accidental charges.

- **HNSW vs IVFFlat**: HNSW was chosen. Unlike IVFFlat, HNSW builds incrementally and requires no table pre-population, making it safe to create in the initial migration. `m=16, ef_construction=64` are sensible defaults; increase `ef_construction` for higher recall at the cost of slower index builds.

- **Dimension mismatch**: If the embedding model changes after data is already stored, existing vectors are incompatible. Plan for a re-embedding migration if the model ever changes. The `EMBEDDING_DIMENSIONS` env var must match the model in use.

- **`drf-spectacular`** is referenced in `copilot-instructions.md` but not yet in `pyproject.toml`. Adding it alongside this work would enable auto-generated API docs for the new endpoints.
