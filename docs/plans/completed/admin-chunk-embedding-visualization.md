# Plan: Admin Visualization of Chunks & Embeddings

**Status:** Complete  
**Date:** 2026-03-17

---

## Goal

Improve the Django admin interface for the `embeddings` app so that administrators can meaningfully inspect documents, chunks, and their associated embedding vectors. Currently the admin shows bare minimum fields — no content previews, no embedding insights, no cross-model navigation, and no aggregate statistics. This plan delivers a rich, actionable admin experience without requiring any frontend changes.

---

## Background

The `embeddings` app stores `Document` and `Chunk` records. Each `Chunk` carries a 1024-dimensional pgvector embedding produced by `BAAI/bge-large-en-v1.5`. The current admin (`admin.py`) registers both models with minimal configuration:

- **DocumentAdmin** — shows `title`, `source`, `created_at`; no chunk count, no content preview, no inline chunks
- **ChunkAdmin** — shows `document`, `chunk_index`, `created_at`; no content preview, no embedding insight

Pain points:
- No quick way to see how many chunks a document produced
- Cannot skim chunk content without clicking into each record
- The 1024-dim embedding vector is invisible — no stats, no sanity-check display
- No way to run a similarity lookup from within the admin
- No aggregate dashboard stats (total docs, total chunks, avg chunks/doc)

---

## Phases

### Phase 1 — Document Admin Improvements

- [x] Add `chunk_count` computed column to `DocumentAdmin.list_display` via an annotated queryset
- [x] Add `content_preview` computed column (first 200 chars of `content`, truncated with ellipsis) to `list_display`
- [x] Add `list_filter` on `created_at` (date hierarchy drill-down via `date_hierarchy`)
- [x] Add `ordering` default to `-created_at`
- [x] Show `chunk_count` and `content_preview` as read-only fields in the detail view
- [x] Add `ChunkInline` (read-only `TabularInline`) on `DocumentAdmin`:
  - Columns: `chunk_index`, `content_preview` (140 chars), `embedding_norm`, `created_at`
  - `max_num = 0` (display-only, no add/delete from inline)
  - `can_delete = False`, `extra = 0`
  - `show_change_link = True` to navigate to individual chunk detail

### Phase 2 — Chunk Admin Improvements

- [x] Add `content_preview` computed column (first 150 chars) to `list_display`
- [x] Add `embedding_norm` computed column — Euclidean norm of the vector (`np.linalg.norm`), formatted to 4 decimal places; a healthy unit-normalised embedding has norm ≈ 1.0
- [x] Add `list_filter` on `document` and `created_at`
- [x] Add `search_fields` on `content` and `document__title`
- [x] Add `ordering` default to `["document", "chunk_index"]`
- [x] In the **detail view**, replace the raw vector field display with a structured read-only section `embedding_detail` showing:
  - **Dimensions**: fixed 1024
  - **Norm**: Euclidean norm (rounded to 6 d.p.)
  - **Min / Max / Mean**: scalar stats across all 1024 dimensions
  - **First 10 values**: comma-separated preview of the first 10 floats (4 d.p. each)
  - **Sparsity**: percentage of dimensions with absolute value < 0.001
  - Rendered as an HTML `<table>` via `format_html` — no external JS required
- [x] Add `embedding` to `exclude` in the form (raw vector not editable, replaced by `embedding_detail`)
- [x] Mark `embedding_detail` as `short_description = "Embedding Vector Stats"`

### Phase 3 — Nearest-Neighbour Admin Action

- [x] Add a custom admin action on `ChunkAdmin`: **"Find 5 nearest neighbours"**
  - For each selected chunk, call `search_similar_chunks(chunk.content, top_k=6)` (top_k+1 to exclude the chunk itself)
  - Filter out the selected chunk from results
  - Render results as a plain HTML response (`TemplateResponse`) listing:
    - Source document title (linked to its admin change page)
    - Chunk index
    - Content preview (first 150 chars)
    - Cosine distance (formatted to 4 d.p.)
  - Limit action to one selected chunk at a time (raise `admin.display(description=...)` warning for multi-selection)
- [x] The action does **not** modify any data — purely read-only lookup

### Phase 4 — Admin Dashboard Stats

- [x] Create a custom `AdminSite` subclass or use Django's built-in `app_index_template`
- [x] Override `app_index_template` on the embeddings `AppConfig` with a custom template `admin/embeddings/app_index.html`
- [x] The template extends `admin/app_index.html` and prepends a stats card block containing:
  - Total Documents
  - Total Chunks
  - Average chunks per document (rounded to 1 d.p.)
  - Min / Max chunks on a single document
  - Total storage estimate for embedding vectors (Total Chunks × 1024 dims × 4 bytes / 1 MB)
- [x] Stats are computed via a thin `AdminStatsView` registered under `/admin/embeddings/document/stats/` using `ModelAdmin.get_urls()` hook on `DocumentAdmin`
- [x] Stats are cached with Django's cache framework (`cache.get_or_set`) with a 60-second TTL to avoid repeated aggregate queries on every admin page load

### Phase 5 — Tests

- [x] Unit-test each computed column method (`content_preview`, `embedding_norm`, `embedding_detail`) in `apps/embeddings/tests/test_admin.py` using `ChunkFactory` / `DocumentFactory`
- [x] Test that `ChunkInline` defers `embedding` field (query-count guard via `CaptureQueriesContext`)
- [x] Test the nearest-neighbour action with monkeypatched `search_similar_chunks` returning deterministic results
- [x] Test the stats endpoint returns 200, correct totals, caching behaviour, and zero-document edge case
- [x] Test `embedding_detail` sparsity, min/max/mean, and first-10-values output

**29 tests, all passing** (`uv run pytest apps/embeddings/tests/test_admin.py`)

---

## Testing

**Unit tests** (`test_admin.py`):
- `test_content_preview_truncates_at_200_chars` — pass a chunk with 300-char content, assert output is 200 chars + `"…"`
- `test_embedding_norm_unit_vector` — create a chunk with a known unit vector, assert norm display is `"1.0000"`
- `test_embedding_detail_structure` — assert all expected keys (Dimensions, Norm, Min, Max, Mean, First 10 values, Sparsity) appear in the HTML output
- `test_chunk_count_annotation` — create a document with 3 chunks, assert `chunk_count` is `3` in list queryset
- `test_nearest_neighbour_action_single_chunk` — monkeypatch `search_similar_chunks`, verify response contains expected chunk titles

**Integration tests** (marked `@pytest.mark.integration`):
- `test_document_admin_list_no_n_plus_1` — load list view with 5 documents each having 10 chunks, assert `assertNumQueries` stays bounded
- `test_chunk_admin_list_with_embeddings` — create real chunks via `ChunkFactory`, load admin list, assert HTTP 200

**Manual verification steps**:
1. `just up` to start Docker services
2. Navigate to `http://localhost:8000/admin/embeddings/document/`
3. Confirm `Chunk count` and `Content preview` columns appear
4. Click into a Document — confirm `ChunkInline` renders with embedding norm per row
5. Navigate to `http://localhost:8000/admin/embeddings/chunk/`
6. Click into a Chunk — confirm `Embedding Vector Stats` table appears with correct norm ≈ 1.0
7. Select a Chunk → run "Find 5 nearest neighbours" action → confirm results page

---

## Implementation Notes

### Avoiding N+1 in Inline
`ChunkInline` must override `get_queryset` to defer the `embedding` field (1024 floats per row is expensive to fetch when displaying inline):
```python
def get_queryset(self, request):
    return super().get_queryset(request).defer("embedding")
```

### Embedding Norm Without Fetching All Rows
For bulk list views, avoid computing embedding norms server-side. Instead, annotate with a raw SQL expression using `pgvector`'s `l2_norm` or a `RawSQL` annotation:
```python
from django.db.models.expressions import RawSQL
qs.annotate(emb_norm=RawSQL("embedding::real[] IS NOT NULL", []))
```
Or prefer deferring the `embedding` field entirely in list views and only computing stats in the **detail view** where a single record is loaded.

### `format_html` Safety
All admin HTML output must use `django.utils.html.format_html` — never string interpolation — to prevent XSS through chunk content.

### Cache Key
```python
ADMIN_STATS_CACHE_KEY = "embeddings_admin_stats"
ADMIN_STATS_TTL = 60  # seconds
```

---

## Risks & Notes

- **Performance**: Fetching the raw 1024-dim vector for bulk list views would be very slow. All list-view computed columns must either defer `embedding` or use DB-side aggregates only.
- **pgvector norm function**: `pgvector` exposes `l2_norm(embedding)` as a Postgres function. This can be used in a `RawSQL` annotation for the list view if a per-row norm column is needed.
- **Nearest-neighbour action latency**: Calling `embed_texts()` from within an admin HTTP request is synchronous and will load the SentenceTransformer model. In development this is acceptable. In production, consider a background task (Celery) if the model is not already warm.
- **Template override scope**: Using `app_index_template` is the least invasive way to add dashboard stats — it requires a template file at `templates/admin/embeddings/app_index.html` inside the backend app, which must be registered in `INSTALLED_APPS` and `TEMPLATES[DIRS]`.
- **Deferred to future**: 2D t-SNE/UMAP scatter plot of chunk embeddings in the admin — this requires JavaScript and a charting library, scoped out of this plan to keep the admin server-rendered.
