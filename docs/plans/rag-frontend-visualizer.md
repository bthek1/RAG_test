# Plan: RAG Frontend Visualizer (Part 2)

**Status:** In Progress — Implementation complete; RAG component tests and route smoke tests still pending  
**Date:** 2026-03-15  
**Depends on:** `docs/plans/completed/rag-implementation-plan.md` (Part 1 — fully complete)

---

## Goal

Build a React frontend that lets you **see, understand, and interact with** every stage of the RAG pipeline. The UI has two purposes:

1. **Educational** — Visualize exactly what happens inside a RAG system: document ingestion → chunking → embedding → vector search → LLM generation. Each step is shown explicitly so the data flow becomes obvious.
2. **Interactive** — Upload your own documents, run similarity searches, trigger full RAG queries, and inspect every intermediate result (chunks, distance scores, Claude's sources).

---

## Current Frontend State (as of 2026-03-15)

This section documents exactly what is already built and what is missing.

### Routes

| File | Route | Status |
|---|---|---|
| `src/routes/__root.tsx` | Root layout | ✅ Done — `AppLayout` for protected routes, bare `Outlet` for public paths |
| `src/routes/index.tsx` | `/` | ✅ Done — Landing page, redirects auth'd users to `/demo/chart` |
| `src/routes/login.tsx` | `/login` | ✅ Done — RHF + Zod login form |
| `src/routes/signup.tsx` | `/signup` | ✅ Done — RHF + Zod signup form with password confirm |
| `src/routes/demo.chart.tsx` | `/demo/chart` | ✅ Done — Plotly chart demo (AppLayout) |
| `src/routes/rag.tsx` | `/rag` | ✅ Done |
| `src/routes/rag.documents.tsx` | `/rag/documents` | ✅ Done |
| `src/routes/rag.search.tsx` | `/rag/search` | ✅ Done |
| `src/routes/rag.chat.tsx` | `/rag/chat` | ✅ Done |

**Root layout:** determines AppLayout vs. bare by checking a `PUBLIC_PATHS` list (`/`, `/login`, `/signup`). Any new `/rag/*` routes are automatically wrapped with AppLayout (navbar + sidebar) without any changes to `__root.tsx`.

### API Layer

| File | Status |
|---|---|
| `src/api/client.ts` | ✅ Done — Axios instance, JWT interceptor, silent refresh on 401 |
| `src/api/auth.ts` | ✅ Done — `login`, `register`, `getMe` |
| `src/api/health.ts` | ✅ Done — `getHealth` |
| `src/api/queryKeys.ts` | ✅ Done — includes `auth`, `health`, and `embeddings` keys |
| `src/api/embeddings.ts` | ✅ Done — `listDocuments`, `getDocument`, `ingestDocument`, `deleteDocument`, `searchSimilar`, `ragQuery` |

### Components — Layout

| File | Status |
|---|---|
| `src/components/layout/AppLayout.tsx` | ✅ Done |
| `src/components/layout/Navbar.tsx` | ✅ Done — theme toggle, user display, logout, health indicator |
| `src/components/layout/Sidebar.tsx` | ✅ Done — collapsible, uses `SidebarNav` |
| `src/components/layout/navItems.ts` | ✅ Done — includes Dashboard and RAG Pipeline section with four links |

### Components — UI (shadcn/ui installed)

| Component | Status |
|---|---|
| `button.tsx` | ✅ Installed |
| `card.tsx` | ✅ Installed |
| `form.tsx` | ✅ Installed |
| `input.tsx` | ✅ Installed |
| `label.tsx` | ✅ Installed |
| `sheet.tsx` | ✅ Installed |
| `textarea.tsx` | ✅ Installed |
| `dialog.tsx` | ✅ Installed |
| `badge.tsx` | ✅ Installed |
| `separator.tsx` | ✅ Installed |
| `scroll-area.tsx` | ✅ Installed |
| `tabs.tsx` | ✅ Installed |
| `tooltip.tsx` | ✅ Installed |
| `skeleton.tsx` | ✅ Installed |
| `alert.tsx` | ✅ Installed |
| `progress.tsx` | ✅ Installed |
| `accordion.tsx` | ✅ Installed |
| `select.tsx` | ✅ Installed |

### Hooks

| File | Status |
|---|---|
| `src/hooks/useAuth.ts` | ✅ Done — `useMe`, `useLogin`, `useRegister`, `useLogout` |
| `src/hooks/useTheme.ts` | ✅ Done — syncs Zustand theme to `<html class>` and localStorage |
| `src/hooks/useDocuments.ts` | ✅ Done — `useDocuments`, `useDocument`, `useIngestDocument`, `useDeleteDocument` |
| `src/hooks/useRAG.ts` | ✅ Done — `useSearch`, `useRAGQuery` |

### State

| File | Status |
|---|---|
| `src/store/ui.ts` | ✅ Done — `sidebarOpen`, `theme` (immer middleware) |
| `src/store/auth.ts` | ✅ Done — `isLoggingOut` flag |

### Types & Schemas

| File | Status |
|---|---|
| `src/types/auth.ts` | ✅ Done — `User`, `TokenPair`, `LoginPayload`, `RegisterPayload` |
| `src/types/embeddings.ts` | ✅ Done — `Document`, `DocumentListItem`, `Chunk`, `SimilaritySearchRequest`, `RAGRequest`, `RAGResponse`, `RAGSource`, `IngestDocumentRequest` |
| `src/schemas/auth.ts` | ✅ Done — `loginSchema`, `registerSchema` |
| `src/schemas/embeddings.ts` | ✅ Done — `ingestDocumentSchema`, `searchQuerySchema`, `ragQuerySchema` |

### Lib Utilities

| File | Status |
|---|---|
| `src/lib/utils.ts` | ✅ Done — `cn()` (clsx + tailwind-merge) |
| `src/lib/date.ts` | ✅ Done — `formatDate`, `formatDateTime`, `formatRelative` |
| `src/lib/theme.ts` | ✅ Done — `themeTokens`, `getCSSVar` |
| `src/lib/similarity.ts` | ✅ Done — `toSimilarityPercent`, `getSimilarityColor` |

### Patterns to follow

All new code must follow these established patterns:

**Hooks pattern** (see `src/hooks/useAuth.ts` as reference):
- `useQuery` with centrally-defined query key from `queryKeys.ts`
- `useMutation` with `onSuccess: () => queryClient.invalidateQueries(...)` for writes
- Never store server-fetched data in Zustand

**API functions pattern** (see `src/api/auth.ts` as reference):
- Import the shared `apiClient` from `src/api/client.ts`
- Return `apiClient.get<T>(...)` / `.post` / `.delete` directly
- No try/catch — errors propagate to TanStack Query

**Test pattern** (see `src/hooks/useAuth.test.tsx` as reference):
- `vi.mock('@/api/embeddings')` at module level — never real HTTP
- Wrap hooks in `renderHook` with `{ wrapper: createWrapper() }` (QueryClientProvider)
- Use `waitFor` for async assertions

**Component test pattern** (see `src/components/ui/Button.test.tsx` as reference):
- Import `render`, `screen`, `userEvent` from `@testing-library/react`
- Use `screen.getByRole`, `screen.getByText` — no `querySelector`

**Zod schema usage** (see `src/routes/login.tsx` as reference):
- Define schema in `src/schemas/<domain>.ts`
- Use `zodResolver(schema)` in `useForm`
- Display via shadcn `FormField` + `FormMessage`

**Nav items** (see `src/components/layout/navItems.ts`):
- Export an array of objects with `{ label, href, icon }` shape
- Group nav items with a `{ group, items: [...] }` wrapper if needed
- Sidebar `SidebarNav` renders these — no changes to `Sidebar.tsx` or `Navbar.tsx`

---

## Background

Part 1 built a complete RAG backend with six authenticated endpoints:

| Endpoint | Purpose |
|---|---|
| `POST /api/embeddings/documents/` | Ingest document → chunk → embed → store |
| `GET /api/embeddings/documents/` | List documents (paginated) |
| `GET /api/embeddings/documents/{id}/` | Document detail + chunk count |
| `DELETE /api/embeddings/documents/{id}/` | Delete document + all chunks |
| `POST /api/embeddings/search/` | Query → embed → HNSW search → top-k chunks |
| `POST /api/embeddings/rag/` | Query → retrieve → Claude → answer + sources |

The frontend already has: authenticated routing (TanStack Router), JWT Axios client with silent refresh, Zustand UI store, TanStack Query for server state, Tailwind CSS v4 + shadcn/ui, and React Hook Form + Zod.

The gap is that everything above is invisible — you can only call it via `curl`. This plan adds a full UI layer.

---

## How RAG Works — The Mental Model

Understanding this makes the UI phases make sense:

```
╔══════════════════════════════════════════════════════════════╗
║                    INGESTION PIPELINE                        ║
║                                                              ║
║  [Document Text]                                             ║
║       │                                                      ║
║       ▼                                                      ║
║  [Chunker]  ──→  [Chunk 1][Chunk 2][Chunk 3]...              ║
║                       │       │       │                      ║
║                       ▼       ▼       ▼                      ║
║              [Embedder (local sentence-transformers)]        ║
║                       │       │       │                      ║
║                       ▼       ▼       ▼                      ║
║              [1024-dim vectors stored in pgvector]           ║
╚══════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════╗
║                    QUERY PIPELINE                            ║
║                                                              ║
║  [User Question]                                             ║
║       │                                                      ║
║       ▼                                                      ║
║  [Embedder]  ──→  [1024-dim query vector]                    ║
║                            │                                 ║
║                            ▼                                 ║
║              [HNSW Approximate Nearest Neighbour]            ║
║              [cosine similarity against all chunk vectors]   ║
║                            │                                 ║
║                            ▼                                 ║
║              [Top-k Chunks + distance scores]                ║
║                            │                                 ║
║                            ▼                                 ║
║  [Context = joined chunk text]                               ║
║       +                                                      ║
║  [User Question]                                             ║
║       │                                                      ║
║       ▼                                                      ║
║  [Claude LLM]  ──→  [Grounded Answer + citations]           ║
╚══════════════════════════════════════════════════════════════╝
```

The frontend maps directly onto this: one screen per pipeline stage.

---

## Phases

### Phase 0 — Utility: `similarity.ts`

A small pure-function module needed by both `SearchResultCard` and `ChatMessage`.

**`frontend/src/lib/similarity.ts`**:
```typescript
/** Convert pgvector cosine distance [0, 2] to similarity percentage [0, 100]. */
export function toSimilarityPercent(distance: number): number {
  return Math.round(Math.max(0, Math.min(100, (1 - distance) * 100)))
}

/** Return a Tailwind text-colour class based on similarity percentage. */
export function getSimilarityColor(pct: number): string {
  if (pct >= 80) return 'text-green-600 dark:text-green-400'
  if (pct >= 50) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}
```

- [x] Create `frontend/src/lib/similarity.ts`
- [x] Create `frontend/src/lib/similarity.test.ts` (pure unit tests, no DOM)

---

### Phase 1 — Frontend API Layer + Types

Add TypeScript types, API functions, query keys, and Zod schemas for all embeddings endpoints. No UI yet — just the data layer.

**Types** (`frontend/src/types/embeddings.ts`):
```typescript
export interface Document {
  id: string                // UUID
  title: string
  source: string
  content: string
  created_at: string        // ISO 8601
  updated_at: string
  chunk_count: number
}

export interface DocumentListItem {
  id: string
  title: string
  source: string
  created_at: string
  chunk_count: number
}

export interface Chunk {
  id: string
  document: string          // Document UUID
  content: string
  chunk_index: number
  created_at: string
  distance?: number         // only present in search results
}

export interface SimilaritySearchRequest {
  query: string
  top_k: number
}

export interface SimilaritySearchResponse {
  results: Chunk[]
}

export interface RAGRequest {
  query: string
  top_k: number
}

export interface RAGSource {
  chunk_id: string
  document_title: string
  content: string
  distance: number
}

export interface RAGResponse {
  answer: string
  sources: RAGSource[]
}

export interface IngestDocumentRequest {
  title: string
  content: string
  source?: string
}
```

**Zod schemas** (`frontend/src/schemas/embeddings.ts`):
```typescript
export const ingestDocumentSchema = z.object({
  title: z.string().min(1, "Title is required").max(512),
  content: z.string().min(10, "Content must be at least 10 characters"),
  source: z.string().optional(),
})

export const ragQuerySchema = z.object({
  query: z.string().min(3, "Query must be at least 3 characters"),
  top_k: z.number().int().min(1).max(20).default(5),
})

export const searchQuerySchema = ragQuerySchema  // same shape
```

**API functions** (`frontend/src/api/embeddings.ts`):
```typescript
// All calls go through the existing Axios client with JWT interceptor
export const listDocuments = () => apiClient.get<DocumentListItem[]>(...)
export const getDocument = (id: string) => apiClient.get<Document>(...)
export const ingestDocument = (data: IngestDocumentRequest) => apiClient.post<Document>(...)
export const deleteDocument = (id: string) => apiClient.delete(...)
export const searchSimilar = (data: SimilaritySearchRequest) => apiClient.post<Chunk[]>(...)
export const ragQuery = (data: RAGRequest) => apiClient.post<RAGResponse>(...)
```

**Query keys** — extend `frontend/src/api/queryKeys.ts`:
```typescript
embeddings: {
  documents: {
    all: ["embeddings", "documents"] as const,
    detail: (id: string) => ["embeddings", "documents", id] as const,
  },
}
```

- [x] Create `frontend/src/types/embeddings.ts`
- [x] Create `frontend/src/schemas/embeddings.ts`
- [x] Create `frontend/src/api/embeddings.ts`
- [x] Extend `frontend/src/api/queryKeys.ts` with `embeddings` keys
- [x] Unit test: `frontend/src/schemas/embeddings.test.ts` (pure Zod, no DOM)

---

### Phase 2 — Custom Hooks

Business logic goes in hooks, not components.

**`frontend/src/hooks/useDocuments.ts`**:
- `useDocuments()` — `useQuery` for document list
- `useDocument(id)` — `useQuery` for single document
- `useIngestDocument()` — `useMutation` that invalidates `embeddings.documents.all` on success
- `useDeleteDocument()` — `useMutation` that invalidates `embeddings.documents.all` on success

**`frontend/src/hooks/useRAG.ts`**:
- `useSearch()` — `useMutation` for similarity search (mutations used for user-triggered queries)
- `useRAGQuery()` — `useMutation` for full RAG query

Why `useMutation` for search/RAG rather than `useQuery`? Search and RAG are triggered by user actions (form submits), not loaded on mount — mutations better model this.

- [x] Create `frontend/src/hooks/useDocuments.ts`
- [x] Create `frontend/src/hooks/useRAG.ts`
- [x] Unit tests for both hooks (mock Axios at module level)

---

### Phase 3 — Install Missing shadcn/ui Components

The following shadcn/ui components are **not yet installed** (see Current Frontend State above). Run each in `frontend/`:

```bash
npx shadcn@latest add textarea
npx shadcn@latest add dialog
npx shadcn@latest add badge
npx shadcn@latest add separator
npx shadcn@latest add scroll-area
npx shadcn@latest add tabs
npx shadcn@latest add tooltip
npx shadcn@latest add skeleton
npx shadcn@latest add alert
npx shadcn@latest add progress
npx shadcn@latest add accordion
npx shadcn@latest add select
```

Already installed and ready to use without re-installing: `button`, `card`, `form`, `input`, `label`, `sheet`.

- [x] Install all 12 missing shadcn/ui components listed above

---

### Phase 4 — Sidebar Navigation

The sidebar renders nav items defined in **`frontend/src/components/layout/navItems.ts`**. The `SidebarNav` component reads this array — no changes to `Sidebar.tsx` or `Navbar.tsx` are needed.

**Current `navItems.ts`** has a single item (Dashboard). Edit it to add a RAG group:

```typescript
// navItems.ts — add this group
{
  group: 'RAG Pipeline',
  items: [
    { label: 'Overview',   href: '/rag',           icon: Home },
    { label: 'Documents',  href: '/rag/documents',  icon: FileText },
    { label: 'Search',     href: '/rag/search',     icon: Search },
    { label: 'Chat',       href: '/rag/chat',       icon: MessageSquare },
  ],
},
```

Import the Lucide icons already available via `lucide-react` (already in `package.json`).

- [x] Edit `frontend/src/components/layout/navItems.ts` to add RAG nav group with four links

---

### Phase 5 — Pipeline Visualizer Component

The centrepiece of `/rag`. An animated, interactive diagram that explains how RAG works at a glance.

**`frontend/src/components/rag/RAGPipelineVisualizer.tsx`**

Renders two pipelines side by side:

**Left panel — Ingestion Pipeline:**
```
[📄 Document]
      │
      ▼
[✂️  Chunker]
  chunk_size=512  overlap=64
      │
   ┌──┴──┐
   ▼     ▼
[C1]  [C2]  [C3]  ...    ← clickable: shows example chunk text
      │
      ▼
[🧠 Embedder]
  BAAI/bge-large-en-v1.5
  1024 dimensions (local, free)
      │
      ▼
[🗄️ pgvector DB]
  HNSW index  m=16  ef=64
```

**Right panel — Query Pipeline:**
```
[❓ User Query]
      │
      ▼
[🧠 Embedder]  (same model)
      │
      ▼
[🔍 HNSW Search]
  cosine similarity
      │
      ▼
[📊 Top-k Chunks]   ← distance scores shown as bars
      │
      ▼
[📝 Context]
      │
      ▼
[🤖 Claude LLM]
  claude-opus-4-5
      │
      ▼
[💬 Answer + Sources]
```

Implementation notes:
- Use Tailwind CSS for the layout (no external diagram library required)
- Animate with CSS transitions: each box fades in on mount, arrows draw in sequence using `animation-delay`
- The "Embedder" box is highlighted on both sides to make clear it's the **same model**
- Clicking any box opens a `Tooltip` or small popover with a plain-English explanation
- A "Live" mode toggle: when the user performs a real RAG query, the boxes in the query pipeline pulse to show which step is currently executing

**`frontend/src/components/rag/PipelineStep.tsx`** — reusable step card with icon, label, and description.

- [x] Create `frontend/src/components/rag/PipelineStep.tsx`
- [x] Create `frontend/src/components/rag/RAGPipelineVisualizer.tsx`
- [x] Add `animated-pulse` / step states: idle | active | done

---

### Phase 6 — Route: `/rag` (Overview / Pipeline Viz)

**File:** `frontend/src/routes/rag.tsx`

> **TanStack Router note:** `rag.tsx` acts as both the `/rag` index page and the layout wrapper for `rag.documents.tsx`, `rag.search.tsx`, `rag.chat.tsx`. It must render `<Outlet />` so nested routes work, with the overview content shown only when the path is exactly `/rag`. Use `createFileRoute('/rag')` with a nested `<Outlet />` at the bottom, and conditionally show the overview content when `location.pathname === '/rag'`. In practice, use TanStack Router's `index` route or a redirect if you want the overview at exactly `/rag`.

A hub page with:
- `RAGPipelineVisualizer` (full-width educational diagram)
- Stats bar: `{totalDocuments} documents`, `{totalChunks} chunks` (summed from document list)
- Quick-start cards linking to the three sub-routes

The route loader pre-fetches the document list so stats render immediately via `queryClient.ensureQueryData`.

- [x] Create `frontend/src/routes/rag.tsx` (layout with `<Outlet />` + overview at `/rag`)
- [x] Stats bar component showing document/chunk counts from `useDocuments()`

---

### Phase 7 — Route: `/rag/documents` (Document Manager)

**File:** `frontend/src/routes/rag.documents.tsx`

Two-panel layout:
- **Left panel:** Document list
  - Each card shows: title, source (if set), chunk count badge, `created_at`
  - Delete button (with confirmation dialog)
  - "Ingest New Document" button opens the form
- **Right panel:** Ingest form (always visible on desktop, sheet/drawer on mobile)

**Ingest Document Form** (`frontend/src/components/rag/IngestDocumentForm.tsx`):
```
Title:    [________________]
Source:   [________________]  (optional, URL or file path)
Content:  [                ]  (large Textarea — paste or type raw text)
          [                ]
          [                ]
          [   Ingest →   ]
```

On submit:
1. Calls `useIngestDocument()` mutation
2. Shows a loading state with a step indicator: "Chunking... → Embedding... → Storing..."
3. On success: toast notification + document appears in list with chunk count
4. On error: inline error message

The "Chunking → Embedding → Storing" step indicator makes the ingestion process **visible**, reinforcing how RAG ingestion works.

**Document detail side-panel** (`frontend/src/components/rag/DocumentDetail.tsx`):
- Shows when a document in the list is clicked
- Displays: title, source, full content (scrollable), chunk count
- Sub-tab "Chunks" expands to show all chunks as numbered cards

- [x] Create `frontend/src/routes/rag.documents.tsx`
- [x] Create `frontend/src/components/rag/IngestDocumentForm.tsx`
- [x] Create `frontend/src/components/rag/DocumentCard.tsx`
- [x] Create `frontend/src/components/rag/DocumentDetail.tsx`
- [x] Delete confirmation via `Dialog` component

---

### Phase 8 — Route: `/rag/search` (Similarity Search Explorer)

**File:** `frontend/src/routes/rag.search.tsx`

This page makes the **retrieval step** visible without the LLM — the user can see exactly what chunks a query matches and how similar they are.

Layout:
```
┌─────────────────────────────────────────────────┐
│  Search Explorer                                 │
│                                                  │
│  Query: [________________________________]  [🔍] │
│  Top-k: [5 ▾]                                    │
│                                                  │
│  Results ──────────────────────────────────────  │
│                                                  │
│  #1  [████████████████░░░░]  0.12  (88% similar) │
│      Document: "My Paper"  •  Chunk #3           │
│      "The transformer architecture...            │
│       attention mechanism allows..."             │
│                                                  │
│  #2  [███████████░░░░░░░░░]  0.28  (72% similar) │
│      Document: "Intro to AI"  •  Chunk #7        │
│      "Neural networks are composed of..."        │
│  ...                                             │
└─────────────────────────────────────────────────┘
```

Key design choices:
- Distance is displayed as `(X% similar)` — cosine distance 0 = 100% similar, 1 = 0% similar, so `similarity = (1 - distance) * 100`
- Each result has a coloured `Progress` bar showing similarity (green when > 80%, amber 50–80%, red < 50%)
- Results are returned instantly on submit (no debounce — it's a deliberate user action)
- Shows a "how does this work?" info box explaining HNSW + cosine similarity in plain English

**`frontend/src/components/rag/SearchResultCard.tsx`** — shows one chunk result with distance bar.

- [x] Create `frontend/src/routes/rag.search.tsx`
- [x] Create `frontend/src/components/rag/SearchResultCard.tsx`
- [x] Implement `(1 - distance) * 100` similarity % display

---

### Phase 9 — Route: `/rag/chat` (Full RAG Interface)

**File:** `frontend/src/routes/rag.chat.tsx`

The main end-to-end RAG experience. A chat-style layout where each exchange shows:
1. The user's question
2. Claude's answer
3. The source chunks that grounded the answer (expandable accordion)
4. An optional "pipeline trace" showing which steps ran (query embedding → vector search → generation)

```
┌─────────────────────────────────────────────────┐
│  RAG Chat                              [⚙ Top-k] │
│ ─────────────────────────────────────────────── │
│  [📄 Sources area - left 35%] [💬 Chat - right 65%]
│                                                  │
│  You: What is the attention mechanism?           │
│                                                  │
│  🤖 Claude:                                      │
│  The attention mechanism allows a model to       │
│  focus on relevant parts of the input...         │
│                                                  │
│  📎 Sources (3 chunks used):                     │
│  ▶ [Chunk from "Attention is All You Need" #4]   │
│  ▶ [Chunk from "Transformers Explained" #2]      │
│  ▶ [Chunk from "NLP Survey" #11]                 │
│  ─────────────────────────────────────────────  │
│  ⏱ Pipeline: embed(12ms) → search(8ms) → gen(~)  │
│                                                  │
│  [Ask something about your documents...    ] [→] │
└─────────────────────────────────────────────────┘
```

Message history is stored in **component state** (not Zustand — it's transient UI state, not global state). Each message object:
```typescript
interface ChatMessage {
  id: string
  type: 'user' | 'assistant'
  query?: string
  answer?: string
  sources?: RAGSource[]
  top_k?: number
  isLoading?: boolean
}
```

Loading state shows typing indicator while Claude is generating.

Source citations use `Accordion` — collapsed by default, click to expand and read the raw chunk text. Each citation shows:
- Document title
- Similarity score (as percentage)
- Raw chunk content

A "Why am I seeing these results?" collapse panel explains: "These chunks had the lowest cosine distance to your query embedding in the HNSW vector index."

`top_k` is configurable via a popover settings button (1–20 range, default 5).

**`frontend/src/components/rag/ChatMessage.tsx`** — renders one message (user or assistant).  
**`frontend/src/components/rag/SourceCitation.tsx`** — expandable source accordion item.  
**`frontend/src/components/rag/TypingIndicator.tsx`** — animated dots while loading.

- [x] Create `frontend/src/routes/rag.chat.tsx`
- [x] Create `frontend/src/components/rag/ChatMessage.tsx`
- [x] Create `frontend/src/components/rag/SourceCitation.tsx`
- [x] Create `frontend/src/components/rag/TypingIndicator.tsx`
- [x] Chat history in component state (`useState<ChatMessage[]>`)
- [x] "Clear history" button

---

### Phase 10 — Testing

**Schema unit tests** (`frontend/src/schemas/embeddings.test.ts`) — pure Zod, no DOM:
- [x] `ingestDocumentSchema` accepts valid title + content
- [x] `ingestDocumentSchema` rejects empty title
- [x] `ingestDocumentSchema` rejects content shorter than 10 characters
- [x] `ingestDocumentSchema` accepts missing `source` (optional field)
- [x] `ragQuerySchema` accepts valid query + top_k
- [x] `ragQuerySchema` rejects query shorter than 3 characters
- [x] `ragQuerySchema` rejects `top_k` = 0 and `top_k` = 21 (out of range)
- [x] `ragQuerySchema` applies default `top_k = 5` when omitted
- [x] `searchQuerySchema` is structurally identical to `ragQuerySchema`

**Utility unit tests** (`frontend/src/lib/similarity.test.ts`) — pure functions, no DOM:
- [x] `toSimilarityPercent(0)` returns `100`
- [x] `toSimilarityPercent(1)` returns `0`
- [x] `toSimilarityPercent(0.5)` returns `50`
- [x] `toSimilarityPercent(-0.1)` is clamped to `100` (guard against edge cases)
- [x] `toSimilarityPercent(1.1)` is clamped to `0`
- [x] `getSimilarityColor(95)` returns green class
- [x] `getSimilarityColor(65)` returns amber class
- [x] `getSimilarityColor(30)` returns red class

**Hook unit tests — `useDocuments`** (`frontend/src/hooks/useDocuments.test.ts`) — mock `@/api/embeddings`:
- [x] `useDocuments()` calls `listDocuments` on mount and returns data
- [x] `useDocument(id)` calls `getDocument(id)` with the correct ID
- [x] `useIngestDocument()` calls `ingestDocument` with form data on mutate
- [x] `useIngestDocument()` on success invalidates `embeddings.documents.all` query key
- [x] `useIngestDocument()` exposes `isPending` during the mutation
- [x] `useDeleteDocument()` calls `deleteDocument(id)` on mutate
- [x] `useDeleteDocument()` on success invalidates `embeddings.documents.all` query key
- [x] `useDeleteDocument()` on error does not invalidate the list

**Hook unit tests — `useRAG`** (`frontend/src/hooks/useRAG.test.ts`) — mock `@/api/embeddings`:
- [x] `useSearch()` calls `searchSimilar` with the correct query + top_k
- [x] `useSearch()` returns typed `Chunk[]` from the API response
- [x] `useSearch()` exposes `isPending` while the mutation is in-flight
- [x] `useRAGQuery()` calls `ragQuery` with the correct query + top_k
- [x] `useRAGQuery()` returns `{ answer, sources }` mapped to `RAGResponse`
- [x] `useRAGQuery()` exposes the error when the mutation fails

**Component tests — `PipelineStep`** (`frontend/src/components/rag/PipelineStep.test.tsx`):
- [ ] Renders icon, label, and description
- [ ] Applies `idle` / `active` / `done` visual state classes correctly
- [ ] Tooltip text is accessible on focus

**Component tests — `RAGPipelineVisualizer`** (`frontend/src/components/rag/RAGPipelineVisualizer.test.tsx`):
- [ ] Renders without crashing
- [ ] Ingestion pipeline steps are all present in the DOM
- [ ] Query pipeline steps are all present in the DOM
- [ ] Embedder step is visually highlighted (shared-model highlight class is present)
- [ ] `liveStep` prop causes the active step to have the `active` state class

**Component tests — `IngestDocumentForm`** (`frontend/src/components/rag/IngestDocumentForm.test.tsx`):
- [ ] Renders Title, Source, and Content fields
- [ ] Submit button is disabled while the mutation is pending
- [ ] Shows Zod validation error when title is left empty
- [ ] Shows Zod validation error when content is too short
- [ ] Calls `useIngestDocument().mutate` with correct values on valid submit
- [ ] Shows "Chunking → Embedding → Storing" step indicator while `isPending`
- [ ] Clears form fields on successful submission
- [ ] Shows inline error message when mutation returns an error
- [ ] Shows soft warning when content length exceeds 50 000 characters

**Component tests — `DocumentCard`** (`frontend/src/components/rag/DocumentCard.test.tsx`):
- [ ] Renders title, source, chunk count badge, and `created_at`
- [ ] Omits source element when `source` is null/undefined
- [ ] Clicking the card fires `onSelect` callback
- [ ] Clicking the delete button fires `onDelete` callback

**Component tests — `DocumentDetail`** (`frontend/src/components/rag/DocumentDetail.test.tsx`):
- [ ] Renders document title and content
- [ ] Displays chunk count
- [ ] Switching to the "Chunks" tab renders numbered chunk cards
- [ ] Shows scrollable content area for long documents

**Component tests — `SearchResultCard`** (`frontend/src/components/rag/SearchResultCard.test.tsx`):
- [ ] `distance = 0` → displays "100% similar" with green progress bar
- [ ] `distance = 0.5` → displays "50% similar" with amber progress bar
- [ ] `distance = 1.0` → displays "0% similar" with red progress bar
- [ ] `distance = -0.05` → clamped, displays "100% similar" (no negative values)
- [ ] Renders document title and chunk index
- [ ] Renders truncated chunk content text

**Component tests — `ChatMessage`** (`frontend/src/components/rag/ChatMessage.test.tsx`):
- [ ] `type = 'user'` renders the query text without sources section
- [ ] `type = 'assistant'` renders the answer text
- [ ] `type = 'assistant'` with sources renders the "Sources" accordion
- [ ] `isLoading = true` renders `TypingIndicator` instead of answer text
- [ ] Sources accordion is collapsed by default
- [ ] Clicking a source accordion item expands it to show chunk content

**Component tests — `SourceCitation`** (`frontend/src/components/rag/SourceCitation.test.tsx`):
- [ ] Renders document title and similarity percentage
- [ ] Content is hidden (accordion collapsed) on initial render
- [ ] Clicking the item expands and shows raw chunk content
- [ ] Clicking again collapses the item

**Component tests — `TypingIndicator`** (`frontend/src/components/rag/TypingIndicator.test.tsx`):
- [ ] Renders three animated dot elements
- [ ] Has accessible `aria-label` describing loading state

**Route smoke tests** (`frontend/src/__tests__/routes/rag.test.tsx`) — mock all API calls:
- [ ] `/rag` renders without crashing and shows `RAGPipelineVisualizer`
- [ ] `/rag` stats bar shows document count from mocked `listDocuments` response
- [ ] `/rag/documents` renders document list and ingest form
- [ ] `/rag/documents` shows empty state when document list is empty
- [ ] `/rag/search` renders query input and top-k selector
- [ ] `/rag/search` shows empty state when no documents exist
- [ ] `/rag/chat` renders message input and submit button
- [ ] `/rag/chat` shows empty state prompting user to ingest documents

---

## File Map

```
frontend/src/
├── api/
│   ├── embeddings.ts           DONE ✅ — API functions for all embeddings endpoints
│   └── queryKeys.ts            DONE ✅ — includes `embeddings` keys
├── types/
│   └── embeddings.ts           DONE ✅ — TypeScript interfaces
├── schemas/
│   ├── embeddings.ts           DONE ✅ — Zod validation schemas
│   └── embeddings.test.ts      DONE ✅ — pure Zod unit tests
├── lib/
│   ├── similarity.ts           DONE ✅ — toSimilarityPercent + getSimilarityColor
│   └── similarity.test.ts      DONE ✅ — pure function unit tests
├── hooks/
│   ├── useDocuments.ts         DONE ✅ — document CRUD hooks
│   ├── useDocuments.test.tsx   DONE ✅ — hook tests (mocked Axios)
│   ├── useRAG.ts               DONE ✅ — search + RAG query hooks
│   └── useRAG.test.tsx         DONE ✅ — hook tests (mocked Axios)
├── components/
│   ├── layout/
│   │   └── navItems.ts         DONE ✅ — includes RAG nav group
│   └── rag/
│       ├── PipelineStep.tsx                    DONE ✅
│       ├── PipelineStep.test.tsx               ⏳ MISSING — still needed
│       ├── RAGPipelineVisualizer.tsx           DONE ✅
│       ├── RAGPipelineVisualizer.test.tsx      ⏳ MISSING — still needed
│       ├── IngestDocumentForm.tsx              DONE ✅
│       ├── IngestDocumentForm.test.tsx         ⏳ MISSING — still needed
│       ├── DocumentCard.tsx                    DONE ✅
│       ├── DocumentCard.test.tsx               ⏳ MISSING — still needed
│       ├── DocumentDetail.tsx                  DONE ✅
│       ├── DocumentDetail.test.tsx             ⏳ MISSING — still needed
│       ├── SearchResultCard.tsx                DONE ✅
│       ├── SearchResultCard.test.tsx           ⏳ MISSING — still needed
│       ├── ChatMessage.tsx                     DONE ✅
│       ├── ChatMessage.test.tsx                ⏳ MISSING — still needed
│       ├── SourceCitation.tsx                  DONE ✅
│       ├── SourceCitation.test.tsx             ⏳ MISSING — still needed
│       ├── TypingIndicator.tsx                 DONE ✅
│       └── TypingIndicator.test.tsx            ⏳ MISSING — still needed
├── routes/
│   ├── rag.tsx                 DONE ✅ — layout + overview + pipeline visualizer
│   ├── rag.documents.tsx       DONE ✅ — document manager
│   ├── rag.search.tsx          DONE ✅ — similarity search explorer
│   └── rag.chat.tsx            DONE ✅ — full RAG chat interface
└── __tests__/
    └── routes/
        └── rag.test.tsx        ⏳ MISSING — route smoke tests still needed
```

> Note: `src/components/ui/` has all 12 components installed (textarea, dialog, badge, separator, scroll-area, tabs, tooltip, skeleton, alert, progress, accordion, select) — Phase 3 complete ✅.

---

## Testing

### Test file map

```
frontend/src/
├── lib/
│   ├── similarity.ts               pure function — distance→% conversion, colour thresholds
│   └── similarity.test.ts          (NEW)
├── schemas/
│   └── embeddings.test.ts          pure Zod — valid/invalid inputs, defaults, boundaries
├── hooks/
│   ├── useDocuments.test.ts        TanStack Query + mocked Axios — list, ingest, delete
│   └── useRAG.test.ts              TanStack Query + mocked Axios — search, RAG query
├── components/
│   └── rag/
│       ├── PipelineStep.test.tsx           icon/label render, idle|active|done states
│       ├── RAGPipelineVisualizer.test.tsx  all steps present, shared-model highlight
│       ├── IngestDocumentForm.test.tsx     RHF + Zod validation, loading/error/success
│       ├── DocumentCard.test.tsx           render props, onSelect/onDelete callbacks
│       ├── DocumentDetail.test.tsx         tabs, chunk list, scrollable content
│       ├── SearchResultCard.test.tsx       distance→colour mapping, clamping
│       ├── ChatMessage.test.tsx            user/assistant variants, TypingIndicator
│       ├── SourceCitation.test.tsx         accordion expand/collapse
│       └── TypingIndicator.test.tsx        renders, aria-label
└── __tests__/
    └── routes/
        └── rag.test.tsx                    smoke tests for all four RAG routes
```

### Unit tests (no DOM)

| File | What is covered |
|---|---|
| `lib/similarity.test.ts` | `toSimilarityPercent`: 0→100, 0.5→50, 1→0, clamping at edges; `getSimilarityColor`: green/amber/red thresholds |
| `schemas/embeddings.test.ts` | Valid/invalid inputs for all three schemas; `top_k` default; `source` optional |

### Hook tests (mocked Axios)

| Hook | Key assertions |
|---|---|
| `useDocuments` | `listDocuments` called on mount; `ingestDocument` called with correct payload; list invalidated on ingest + delete success |
| `useDocument(id)` | `getDocument(id)` called with correct UUID |
| `useDeleteDocument` | Invalidates list on success; does not invalidate on error |
| `useSearch` | `searchSimilar` called with query + top_k; response mapped to `Chunk[]`; `isPending` exposed |
| `useRAGQuery` | `ragQuery` called with query + top_k; response mapped to `RAGResponse`; error exposed |

### Component tests (jsdom, mocked API)

| Component | Key assertions |
|---|---|
| `PipelineStep` | Renders icon/label/description; correct class for each step state |
| `RAGPipelineVisualizer` | All ingestion + query steps in DOM; embedder highlight class; `liveStep` prop applies active state |
| `IngestDocumentForm` | All fields render; submit disabled while pending; Zod errors shown inline; step indicator visible during pending; form clears on success; error shown on failure; 50k char soft warning |
| `DocumentCard` | Title/source/badge/date render; source absent when null; `onSelect` + `onDelete` fire |
| `DocumentDetail` | Title + content render; chunk count shown; Chunks tab lists numbered items |
| `SearchResultCard` | distance 0 → green 100%; distance 0.5 → amber 50%; distance 1 → red 0%; negative distance clamped |
| `ChatMessage` | User variant has no sources; assistant renders answer; `isLoading` shows `TypingIndicator`; sources accordion collapsed by default |
| `SourceCitation` | Collapsed on mount; click expands content; click again collapses |
| `TypingIndicator` | Three dot elements; accessible `aria-label` |

### Route smoke tests (mocked all API)

| Route | Key assertions |
|---|---|
| `/rag` | Renders without crash; pipeline visualizer present; stats bar shows mocked document count |
| `/rag/documents` | Document list + ingest form render; empty state shown when list is empty |
| `/rag/search` | Query input + top-k selector present; empty-state CTA shown with no documents |
| `/rag/chat` | Message input + submit button present; empty-state CTA shown with no documents |

### Manual verification steps

1. `just up` — start Postgres (pgvector) container
2. `just be-migrate` — verify migrations apply cleanly
3. `just be-dev` — start Django dev server
4. `just fe-dev` — start Vite dev server
5. Navigate to `http://localhost:5173`, log in
6. Click "RAG Pipeline" in sidebar → verify pipeline diagram renders with animated arrows
7. Navigate to Documents → paste a paragraph of text → click Ingest → verify "Chunking → Embedding → Storing" step indicator, then chunk count badge appears
8. Navigate to Search → type a query → verify ranked results with colour-coded similarity bars
9. Navigate to Chat → ask a question about the ingested document → verify Claude answer + collapsible source citations render
10. In Chat: verify typing indicator appears while the request is in-flight
11. In Chat: click "Clear history" → verify messages are removed
12. In Search/Chat with no documents: verify empty-state CTA is shown (not an error)
13. Restart backend mid-request: verify the "Model loading" message appears after 3 seconds

---

## Risks & Notes

- **`ANTHROPIC_API_KEY` required for `/rag/chat`**: The RAG Chat route makes real Claude API calls. If the API key is not set in the backend `.env`, the endpoint will return a 500. The frontend should handle this gracefully with an `Alert` component explaining the key is missing, rather than showing a blank error state. The Search page works without the API key (retrieval only).

- **Embedding latency on first query**: The first request after the backend starts will trigger `sentence-transformers` model loading (~5–10 seconds, ~1.3 GB model). The Ingest and Search forms should show a "Model loading, this may take a moment..." message after a 3-second delay if the request is still pending. All subsequent requests will be fast (model is cached in memory).

- **Empty document collection**: The Search and Chat pages should show an empty state with a call-to-action ("No documents yet — go to Documents to ingest your first document") rather than an error when the collection is empty.

- **TanStack Router file naming**: TanStack Router uses `.` as a path separator. The files `rag.documents.tsx`, `rag.search.tsx`, and `rag.chat.tsx` will resolve to `/rag/documents`, `/rag/search`, and `/rag/chat` respectively. The parent `rag.tsx` file serves as the layout route. After adding files, run `just fe-dev` once — TanStack Router auto-generates the updated `routeTree.gen.ts`. Commit this file.

- **`__root.tsx` requires no changes**: New `/rag/*` routes automatically inherit `AppLayout` (navbar + sidebar) because `PUBLIC_PATHS` only lists `/`, `/login`, `/signup`. No edits to `__root.tsx` are needed.

- **`navItems.ts` shape**: Before editing, read `src/components/layout/navItems.ts` first to confirm the exact data shape expected by `SidebarNav`. Match it exactly — do not change `SidebarNav`'s rendering logic.

- **Long documents**: The content `Textarea` in the ingest form has no functional limit (the backend handles chunking). However, very large pastes (>100k characters) may freeze the browser — add a soft warning above 50k characters but allow submission.

- **Distance scores**: cosine distance from pgvector ranges 0 (identical) to 2 (opposite). In practice for sentence embeddings it stays in the 0–1 range. The formula `(1 - distance) * 100` gives a useful 0–100% similarity percentage. Clamp to `[0, 100]` to guard against edge cases.

- **Chat history is not persisted**: Message history lives in React state and is cleared on navigation or refresh. If persistence is desired in the future, it would require a new backend endpoint and is explicitly out of scope for this plan.

- **`source` field is nullable**: The backend `DocumentListItem` may return `source: null` (not just `undefined`). Type it as `source: string | null` in `types/embeddings.ts` and guard for it in `DocumentCard`.

- **Zod v4 defaults syntax**: The project uses `zod 4.x`. Use `z.number().default(5)` inside the schema object (not `.optional().default()`). Verify the resolved type for `top_k` is `number` not `number | undefined`.
