# pgvector — Vector Storage and Search in PostgreSQL

## What is pgvector?

[pgvector](https://github.com/pgvector/pgvector) is a PostgreSQL extension that adds a `vector` column type and efficient nearest-neighbour search operators. This project uses it to store and query text embeddings produced by `sentence-transformers`.

The Docker image `pgvector/pgvector:pg16` ships with the extension pre-built. The extension is activated per-database via the migration `0001_enable_pgvector.py` which runs `CREATE EXTENSION IF NOT EXISTS vector`.

---

## Embedding Model

| Property | Value |
|---|---|
| Model | `BAAI/bge-large-en-v1.5` |
| Dimensions | **1024** |
| Source | HuggingFace (downloaded locally by `sentence-transformers`) |
| Cost | Free — runs on CPU, no API key required |
| Configuration | `EMBEDDING_MODEL` env var (default `BAAI/bge-large-en-v1.5`) |

Alternative free models runnable via `sentence-transformers`:

| Model | Dims | Notes |
|---|---|---|
| `BAAI/bge-large-en-v1.5` | 1024 | Best quality in BGE family ✅ current |
| `BAAI/bge-base-en-v1.5` | 768 | Good balance of speed and quality |
| `BAAI/bge-small-en-v1.5` | 384 | Fastest, lowest memory |
| `all-MiniLM-L6-v2` | 384 | Very popular general-purpose model |

> **Important:** If you change the embedding model, you must also change `EMBEDDING_DIMENSIONS` and create a new migration to alter `Chunk.embedding` to the new dimension. Existing vectors are incompatible and must be re-embedded.

---

## Index: HNSW vs IVFFlat

pgvector ships two approximate nearest-neighbour index types:

| Feature | IVFFlat | **HNSW** ✅ chosen |
|---|---|---|
| Build approach | Centroid clustering | Graph-based (Hierarchical NSW) |
| Pre-population required | Yes — table must have rows before `CREATE INDEX` | No — builds incrementally |
| Recall | Good (tunable via `probes`) | Excellent (tunable via `ef_search`) |
| Query speed | Fast | Faster at high recall levels |
| Memory usage | Lower | Higher (stores graph edges) |
| `lists` tuning | Required (`≈ sqrt(row_count)`) | Not required |

HNSW was chosen because it works on an empty table (index is built on insert) and delivers higher recall without requiring upfront tuning.

### HNSW Parameters

```python
HnswIndex(
    fields=["embedding"],
    name="chunk_embedding_hnsw_idx",
    m=16,               # number of bi-directional links per node (connectivity)
    ef_construction=64, # size of dynamic candidate list during build (quality)
    opclasses=["vector_cosine_ops"],  # cosine distance / similarity
)
```

- **`m`** — Controls graph connectivity. Higher `m` = higher recall + larger index + slower inserts. Default 16 is a good starting point.
- **`ef_construction`** — Controls build-time quality. Higher = better index + slower build. Increase to 128–200 for higher recall if you can afford slower ingestion.
- **`ef_search`** — Query-time parameter. Set at the session level with `SET hnsw.ef_search = 100` before a query to trade speed for recall.

### Distance Operator

Cosine distance (`<=>`) is used because BGE models are trained with cosine similarity. The query always returns `CosineDistance` annotation, where **lower distance = more similar** (0 = identical, 2 = opposite).

---

## Data Flow

```
POST /api/embeddings/documents/
        │
        ▼
  services.ingest_document()
        │
        ├── chunk_document()        # sliding-window sentence chunker
        │
        ├── embed_texts()           # sentence-transformers local model
        │       └── SentenceTransformer.encode()  ← model singleton
        │
        └── Chunk.objects.bulk_create()  ← stores (content, embedding) in Postgres

POST /api/embeddings/search/
        │
        ▼
  services.search_similar_chunks()
        │
        ├── embed_texts([query])    # embed the query locally
        │
        └── Chunk.objects
              .annotate(distance=CosineDistance("embedding", query_vec))
              .order_by("distance")[:top_k]   ← HNSW index used here

POST /api/embeddings/rag/
        │
        ▼
  services.search_similar_chunks()  ← retrieve top-k chunks
        │
        ▼
  services.generate_answer()        ← Anthropic Claude API
        │
        └── Returns { answer, sources }
```

---

## Chunking Strategy

`chunk_document(content, chunk_size=512, overlap=64)` implements a simple sliding-window chunker:

1. Split the document on sentence boundaries (`(?<=[.!?])\s+`).
2. Accumulate sentences until `chunk_size` characters would be exceeded.
3. When the limit is hit, emit the current chunk and keep the last `overlap` characters worth of sentences for the next chunk.

The overlap ensures that context spanning a chunk boundary is captured in both adjacent chunks, improving retrieval quality.

---

## Testing Guidance

- **Unit tests** (`test_services.py`): Monkeypatch `get_embedding_model` to return a dummy object with a fixed `encode()` method. No model download, no GPU.
- **Integration tests** (`test_views.py`): Marked `@pytest.mark.integration`. Require a live Postgres+pgvector instance (the Docker `db` service). Patch `embed_texts` to return zero vectors of the correct dimension (1024).
- SQLite tests skip all pgvector code — the `CREATE EXTENSION` migration is a no-op on SQLite.

Run integration tests against the Docker database:

```bash
INTEGRATION_DATABASE_URL=postgres://appuser:apppassword@localhost:5434/appdb \
  uv run pytest apps/embeddings/tests/ -m integration -v
```
