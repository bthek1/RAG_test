Here's the full picture in one place.

---

## Recovery Metrics — RAG Pipeline Architecture Summary

### Guiding principles

- `embeddings` app is a **generic, stable foundation** — no pipeline-specific logic ever touches it
- All behaviour variation lives in **type classes**, not model branches or conditionals
- Every new pipeline type is just a new class + registry entry — no migrations, no new tasks
- Django ORM is authoritative; pgvector is a query index, not a source of truth
- Faithfulness is the critical metric given the healthcare/professional context

---

### App layout

```
apps/
  embeddings/        # Document, Chunk, VectorField — the storage layer
  collections/       # Collection, CollectionDocument — grouping + namespace
  pipelines/         # Pipeline types, source adapters, chunkers, Celery tasks
    types/           # one file per pipeline type (company, policy, market, economics...)
    sources/         # source adapters (web crawler, gov feed, financial APIs, academic)
    chunking/        # chunking strategies (semantic, legislative, tabular, citation-aware)
  retrieval/         # query, rerank, context assembly — fully type-agnostic
  api/               # DRF viewsets + routers
```

---

### Data model hierarchy

```
ResearchPipeline  (type tag + config JSONField)
    └── Collection  (namespace for a logical knowledge base)
            └── Document  (a webpage, PDF, filing, gazette, paper...)
                    └── Chunk  (text window + 1024-dim embedding)

PipelineRun  (audit trail per execution — status, trigger, counts, error log)
```

**`Document`** — UUID pk, title, source URL/path, raw content, status (`PENDING → PROCESSING → DONE / FAILED`), timestamps, `metadata` JSONField (source publish date, jurisdiction, ticker, etc.)

**`Chunk`** — UUID pk, FK to Document, content, chunk_index, `VectorField(1024)`, `metadata` JSONField, HNSW index with `vector_cosine_ops`

**`Collection`** — UUID pk, name, namespace slug, M2M to Document through `CollectionDocument`

**`ResearchPipeline`** — UUID pk, `pipeline_type` choice, OneToOne to Collection, `config` JSONField (carries all type-specific params: seed URLs, company name, ticker, jurisdiction, feed URLs, refresh cadence, etc.)

**`PipelineRun`** — FK to Pipeline, status (`PENDING / RUNNING / DONE / PARTIAL / FAILED`), trigger (`manual / scheduled / event`), timestamps, `docs_discovered`, `docs_ingested`, `docs_skipped`, `error_log` JSONField

---

### Pipeline types and what varies per type

| | Company Researcher | Policy Analyser | Market Analyst | Economics Expert |
|---|---|---|---|---|
| **Sources** | Web crawl, news, Crunchbase | Gov RSS feeds, legislation PDFs, XML gazettes | EDGAR, Yahoo Finance, financial news | arXiv, SSRN, central bank reports, ABS releases |
| **Refresh policy** | Scheduled (configurable days) | Event-driven (new publish date in feed) | Market hours / 24h staleness | Scheduled + event (CPI, rate decisions) |
| **Chunker** | Semantic (sentence-window) | Legislative (section/clause aware) | Tabular (table extraction pass) | Citation-aware |
| **Doc types** | HTML, PDF, JSON | PDF, HTML, XML | JSON, CSV, PDF, HTML | PDF, HTML, CSV |

---

### Type class contract (`BasePipelineType`)

Each concrete type declares:
- `pipeline_type` — matches registry key
- `refresh_policy` — `manual / scheduled / event_driven / market_hours`
- `source_adapter_classes` — ordered list, tried in sequence
- `chunker_class` — resolved via `CHUNKER_REGISTRY`
- `should_reingest(document)` — staleness logic per type
- `seed_urls()` — derived from `config` JSONField

Adding a new pipeline type = new class + `PIPELINE_REGISTRY` entry. No migrations. No new Celery tasks.

---

### Source adapters (`BaseSourceAdapter`)

One adapter per source category. Concrete adapters:
- `WebCrawlerAdapter` — httpx + depth limit, respects robots.txt
- `NewsSearchAdapter` — news API or SerpAPI
- `GovFeedAdapter` — RSS/Atom parser + PDF gazette fetcher (Australian gov sources are Atom + PDF-heavy)
- `LegislationPDFAdapter` — structured PDF extraction (legislation.gov.au, Federal Register)
- `EdgarAdapter` — SEC EDGAR full-text search API
- `YFinanceAdapter` / `FinancialNewsAdapter`
- `ArXivAdapter` / `SSRNAdapter` / `CentralBankAdapter`

Each adapter yields `{url, title, content, metadata}` dicts consumed by the ingest task.

---

### Chunking strategies (`BaseChunker`)

- `SemanticChunker` — sentence-window with overlap, default for most types
- `LegislativeChunker` — splits on section/clause markers, preserves hierarchy in metadata
- `TabularChunker` — extracts tables separately, serialises to text, chunks prose normally
- `CitationChunker` — splits on paragraph boundaries, preserves citation refs in metadata

All chunkers write `chunk_index` and `metadata` onto each `Chunk`. Chunker resolved by key from `CHUNKER_REGISTRY` so Celery tasks stay type-agnostic.

---

### Celery task chain

```
run_pipeline(pipeline_id, trigger)          # one orchestrator — resolves type, creates PipelineRun
    └── per source → ingest_document(...)   # fetch → chunk → embed → upsert, updates PipelineRun counters
            └── embed_chunk(chunk_id)       # BAAI/bge-large-en-v1.5 via sentence-transformers, async if batching
```

Refresh scheduling: Celery Beat runs `check_stale_pipelines` periodically — calls `impl.should_reingest(document)` per type, enqueues `run_pipeline` only where needed. Event-driven types (policy, economics) additionally listen on a Django signal or webhook that triggers `run_pipeline` directly.

---

### Retrieval layer (type-agnostic)

```
query → embed → pgvector cosine search (filtered by collection namespace)
      → top-K candidates → cross-encoder rerank → top-N chunks
      → context assembly → Anthropic SDK call
```

Retrieval filters by `document__collections=collection` — the namespace is the only join needed. No pipeline-type logic bleeds into retrieval. RAGAS evaluates faithfulness as primary metric.

---

### DRF API surface (rough)

```
POST   /api/pipelines/                          # create pipeline + collection
POST   /api/pipelines/{id}/run/                 # trigger manual run
GET    /api/pipelines/{id}/runs/                # run history + status
GET    /api/pipelines/{id}/documents/           # documents in collection
POST   /api/retrieval/query/                    # query against a collection
GET    /api/collections/{id}/chunks/            # debug / inspection
```

---

### What's deferred (decide when you get there)

- **Multi-collection query** — querying across multiple pipelines simultaneously
- **Per-chunk GIN index** on `metadata` — add once you know which keys you filter on
- **Re-ranking model choice** — cross-encoder locally vs Cohere Rerank API
- **Frontend pipeline builder** — React UI for configuring `config` JSONField per type