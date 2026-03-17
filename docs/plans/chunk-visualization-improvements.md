# Plan: Chunk Visualization Improvements

**Status:** Complete  
**Date:** 2026-03-17  
**Depends on:** `docs/plans/completed/rag-implementation-plan.md` (backend done), `docs/plans/rag-frontend-visualizer.md` (frontend foundation done)

---

## Goal

Significantly improve how individual chunks are displayed, browsed, and understood throughout the UI. Currently chunks are either buried in fixed-height scroll areas (SearchResultCard, SourceCitation) or completely absent from the DocumentDetail view. A user who has just ingested a 40-page PDF has no way to inspect what the chunker produced, or which chunk a search result came from.

This plan introduces:
- A per-document chunk browser (new "Chunks" tab in DocumentDetail)
- A new standalone `ChunkCard` component with expandable content and rich metadata
- Improved `SearchResultCard` that shows the source document title and lets the user expand full content
- Improved `SourceCitation` with a more readable content area
- A new backend endpoint (`GET /api/embeddings/documents/{id}/chunks/`) and an enriched `Chunk` serializer that includes `document_title`

---

## Background

### Current problems

| Location | Issue |
|---|---|
| `SearchResultCard` | Fixed `h-28` scroll area — long chunks are unreadable; no document title shown |
| `SourceCitation` | `h-24` area — even shorter, same problem |
| `DocumentDetail` | Shows only raw document content as a monolithic `<pre>` — no chunk breakdown; users cannot see what was actually ingested |
| `Chunk` type / API | `document_title` is absent from search results — users see a UUID but not which document the chunk came from |
| No chunks list endpoint | There is no `GET /api/embeddings/documents/{id}/chunks/` endpoint — internal chunk data is invisible to the frontend |
| No position indicator | "Chunk 3" means nothing without knowing the total count — "Chunk 3 of 12" gives instant spatial context |

### What good looks like

After this plan is complete:

1. A user opens a document → switches to the **Chunks** tab → sees every chunk as a card, each showing its index out of total, a character-count bar, a content preview that expands on click, and the first/last few characters.
2. A semantic search result shows the **document title** prominently above the similarity bar, and the content area expands to full height instead of overflowing in 112px.
3. A RAG source citation in the chat view has space to display at least 6 lines of text before collapsing.
4. The API contract is updated so `Chunk` objects from all endpoints carry `document_title`.

---

## Phases

### Phase 1 — Backend: Chunk list endpoint + serializer enrichment

**Goal:** expose per-document chunks to the frontend and add `document_title` to all chunk responses.

- [ ] In `backend/apps/embeddings/serializers.py`: add `document_title` field to `ChunkSerializer` via `SerializerMethodField` (returns `self.instance.document.title`). Use `select_related("document")` in any view that serializes chunks.
- [ ] In `backend/apps/embeddings/views.py`: add `DocumentChunkListView` — `GET /api/embeddings/documents/{id}/chunks/`, returns all chunks for that document ordered by `chunk_index`, authenticated (`IsAuthenticated`). Returns 404 if document does not belong to the requesting user (or does not exist).
- [ ] In `backend/apps/embeddings/urls.py`: wire `path("documents/<uuid:id>/chunks/", DocumentChunkListView)`.
- [ ] In `backend/apps/embeddings/tests/`: add test for the new view (list, ordering, 404 for unknown doc, auth required).
- [ ] Verify `SimilaritySearchView` also uses `select_related("document")` so `document_title` is populated in search results without N+1 queries.

**Output shape** — `GET /api/embeddings/documents/{id}/chunks/` response:
```json
[
  {
    "id": "uuid",
    "document": "uuid",
    "document_title": "My PDF",
    "content": "...",
    "chunk_index": 0,
    "created_at": "2026-03-17T..."
  },
  ...
]
```

---

### Phase 2 — Frontend: Type & API layer

**Goal:** expose the new endpoint and enriched field through the standard API/hook stack.

- [ ] In `src/types/embeddings.ts`: add `document_title?: string` to `Chunk` interface.
- [ ] In `src/api/embeddings.ts`: add `listChunks(documentId: string): Promise<AxiosResponse<Chunk[]>>` — `GET /api/embeddings/documents/{documentId}/chunks/`.
- [ ] In `src/api/queryKeys.ts`: add `embeddings.documents.chunks(id)` key — `["embeddings", "documents", id, "chunks"] as const`.
- [ ] In `src/hooks/useDocuments.ts`: add `useChunks(documentId: string | undefined)` hook — `useQuery` enabled only when `documentId` is set; fetches `listChunks(documentId)`.

---

### Phase 3 — New `ChunkCard` component

**Goal:** a standalone, reusable card that renders one chunk with full metadata and expandable content.

Create `src/components/rag/ChunkCard.tsx`:

```
Props:
  chunk: Chunk
  totalChunks?: number      // enables "3 / 12" position indicator
  showDocument?: boolean    // show document_title if present (default true)
  defaultExpanded?: boolean
```

Features:
- [ ] Header row: `#{chunk_index + 1}` out of `totalChunks` (e.g. "3 / 12"), document title (if `showDocument` and `document_title` present), char count (`{chunk.content.length.toLocaleString()} chars`).
- [ ] Character-length bar: a thin `Progress` bar where `value = (chunk.content.length / maxCharsInSet) * 100`, communicates relative size within the result set. When rendered standalone (no `maxChars` prop) the bar shows absolute fill at 100%.
- [ ] Content area: collapsed by default to 5 lines (`line-clamp-5`), click "Show more / Show less" toggle to expand fully. No fixed-height scroll area — natural document flow.
- [ ] Distance/similarity row: only shown when `chunk.distance` is defined — same `Progress` + `getSimilarityColor` pattern as current `SearchResultCard`.
- [ ] Footer: `font-mono text-[10px]` showing truncated chunk UUID.
- [ ] Accessible: `aria-expanded` on the toggle button, `id/aria-controls` on the content region.

---

### Phase 4 — Improved `SearchResultCard`

**Goal:** replace the existing card with one built on `ChunkCard` or directly with the new patterns.

- [ ] Show `chunk.document_title` (if defined) prominently in the card header — bold, 1 line, truncated with `Tooltip` on hover showing full title.
- [ ] Replace fixed `h-28 ScrollArea` with the expand/collapse pattern from `ChunkCard` (`line-clamp-5` + "Show more").
- [ ] Display character count next to distance badge.
- [ ] Keep rank badge (`#1`, `#2`, …) and similarity `Progress` bar — no regression on existing information density.
- [ ] Accept optional `totalResults?: number` for future use (not wired yet).

> **Option:** refactor `SearchResultCard` to simply render `<ChunkCard chunk={chunk} showDocument totalChunks={undefined} />` plus a rank badge overlay — this avoids duplication. Decide during implementation.

---

### Phase 5 — DocumentDetail: Chunks tab

**Goal:** allow users to browse every chunk of a document from within the document detail panel.

- [ ] In `DocumentDetail`, add a third tab: `"Chunks"` (between "Info" and "Content", or after "Content").
- [ ] The Chunks tab renders a new `ChunkList` component:
  - Fetches chunks via `useChunks(documentId)`.
  - Shows loading skeletons (3–5 `Skeleton` cards) while fetching.
  - Once loaded, renders `chunk_count` stat at the top: `{chunks.length} chunks · avg {avgChars} chars`.
  - Renders each chunk as a `ChunkCard` with `totalChunks={chunks.length}` and `showDocument={false}`.
  - `maxChars` for the length bar is `Math.max(...chunks.map(c => c.content.length))` — so bars are relative within the document.
- [ ] Empty state: "No chunks found" with a muted hint to re-ingest.
- [ ] Error state: `Alert` component with "Failed to load chunks."

Create `src/components/rag/ChunkList.tsx`:
```
Props:
  documentId: string
```

---

### Phase 6 — Improved `SourceCitation`

**Goal:** make cited chunks in chat legible.

- [ ] Increase collapsed content area from `h-24` to `h-36` (9 lines at `text-xs leading-relaxed`).
- [ ] Add `document_title` to footer along with distance and chunk ID (SourceCitation already has `document_title` from `RAGSource` — just move it to footer for scanning).
- [ ] When `source.chunk_id` is available, render a small "View in document" button (opens document detail if/when a drawer/sheet UI is added — for now just a placeholder `disabled` `Button` with a `Tooltip` "Coming soon").
- [ ] No change to the accordion trigger layout (it already shows title + similarity badge well).

---

### Phase 7 — Update API contracts doc

- [ ] In `docs/standards/api-contracts.md`: document the new `GET /api/embeddings/documents/{id}/chunks/` endpoint with request/response shape.
- [ ] Update the `Chunk` object definition to include the `document_title` field.

---

### Phase 8 — Tests

All tests use the established patterns: `vi.mock(...)` at module level, `renderHook` with `createWrapper()`, `render`/`screen`/`userEvent` for components, no real HTTP.

#### Backend tests

- [ ] `backend/apps/embeddings/tests/test_chunk_list_view.py`
  - `test_list_chunks_authenticated` — 200, ordered by `chunk_index`, includes `document_title`
  - `test_list_chunks_unauthenticated` — 401
  - `test_list_chunks_unknown_document` — 404
  - `test_list_chunks_empty` — 200, empty list

#### Frontend hook tests

- [ ] `src/hooks/useDocuments.test.tsx` — add:
  - `useChunks` — idle when `documentId` is undefined
  - `useChunks` — queries when `documentId` is set, returns chunk array
  - `useChunks` — error state

#### Frontend component tests

- [ ] `src/components/rag/ChunkCard.test.tsx`
  - renders rank + content + char count
  - shows document title when `showDocument=true` and `document_title` is present
  - hides document title when `showDocument=false`
  - expand/collapse toggles correctly (`aria-expanded` changes)
  - similarity bar + percentage shown when `distance` present
  - similarity bar hidden when `distance` absent
  - "N / M" position shown when `totalChunks` provided
  - "N" only shown when `totalChunks` omitted

- [ ] `src/components/rag/SearchResultCard.test.tsx`
  - renders rank
  - shows document title when `document_title` present
  - omits document title row when absent
  - expand/collapse works
  - similarity progress + percentage rendered when `distance` present

- [ ] `src/components/rag/SourceCitation.test.tsx`
  - renders document_title and similarity badge in trigger
  - expands to show content and footer metadata (distance, chunk ID)
  - "View in document" button is present and disabled

- [ ] `src/components/rag/ChunkList.test.tsx`
  - renders skeletons while loading
  - renders chunk cards once loaded
  - shows summary stat line (chunk count + avg chars)
  - renders error `Alert` on query error
  - renders empty state when `chunks = []`

- [ ] `src/components/rag/DocumentDetail.test.tsx`
  - renders Info tab (existing behaviour)
  - renders Content tab (existing behaviour)
  - renders Chunks tab — tab trigger exists, clicking it shows chunk list
  - ChunkList receives correct `documentId` prop

#### Existing tests to update

- [ ] `src/schemas/embeddings.test.ts` — no change needed (schemas unchanged)
- [ ] `src/hooks/useRAG.test.tsx` — no change needed
- [ ] `src/components/rag/PDFDropZone.test.tsx` — no change needed

---

## Testing

### Unit tests
- All new components: `ChunkCard`, `ChunkList`
- Updated components: `SearchResultCard`, `SourceCitation`, `DocumentDetail`
- New hook: `useChunks`
- Backend view: `DocumentChunkListView`

### Integration tests
- Backend: chunk list view with real DB (via pytest-django + factory-boy)
- Frontend: route smoke tests in `src/__tests__/routes/rag.test.tsx` should still pass after DocumentDetail changes

### Manual verification steps
1. Ingest a PDF → open DocumentDetail → click "Chunks" tab → verify all chunks render with correct indices and content previews.
2. Run a similarity search → verify document title appears above each result, expand one result to full content.
3. Run a RAG query → open a source citation accordion → verify content area shows ≥6 lines before scrolling.
4. Verify no N+1 query warnings in Django's debug toolbar when the chunk list endpoint is hit.

---

## Risks & Notes

- **Backend endpoint ownership:** The `GET /api/embeddings/documents/{id}/chunks/` endpoint should enforce that only the document owner can list its chunks — confirm `DocumentChunkListView` filters by `request.user`.
- **Large documents:** A document split into 200+ chunks can overwhelm the Chunks tab. Consider adding a `VirtualList` or pagination in a follow-up; for now, rely on `ScrollArea` with a fixed max height for the list.
- **`document_title` field naming:** Adding `document_title` to `ChunkSerializer` is a non-breaking additive change — existing consumers are unaffected.
- **`SearchResultCard` refactor:** Reusing `ChunkCard` internally is the preferred approach but not mandatory if it adds unwanted complexity. Decide empirically during Phase 4.
- **Phase 6 "View in document" button:** Intentionally left as a disabled placeholder. A follow-up plan can wire it to a drawer/sheet showing the full document with the relevant chunk highlighted.
