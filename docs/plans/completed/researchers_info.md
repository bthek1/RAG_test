# Plan: Researcher App — Search Engine + Frontend UI

**Status:** Complete
**Date:** 2026-03-25
**Completed:** 2026-04-22

---

## Goal

Build a standalone search-and-scrape engine that finds relevant web content for a query and returns structured results (title, URL, scraped text), then surface those results in the React frontend with full visibility into the search/scrape workflow. No LLM involvement at this layer — summarisation and generation will be handled downstream by the existing `embeddings` and `chat` apps.

---

## Background

The researcher acts as the data collection layer. It runs a DuckDuckGo search, scrapes the top results, and returns clean text ready to be ingested by the embeddings pipeline or passed to the chat service. Keeping search/scrape decoupled from LLM logic makes each layer independently testable and replaceable.

The frontend page mirrors the `/rag/search` UX pattern: a form at the top, a results list below, and an expandable detail view so the user can see raw scraped text for each result.

---

## Stack

| Layer | Tool | Why |
|---|---|---|
| Search | DuckDuckGo (`duckduckgo-search`) | Free, no API key |
| Content extraction | `httpx` + `BeautifulSoup4` | Scrape full page text |
| Orchestration | Django app (`apps/researcher/`) | Fits existing monorepo structure |
| Frontend routing | TanStack Router file-based routes | Matches project conventions |
| Frontend data | TanStack Query `useMutation` | Search is a form-submit action |
| Form validation | React Hook Form + Zod | Matches project conventions |
| Styling | Tailwind CSS v4 + shadcn/ui | Matches project conventions |

---

## Install

```bash
# backend
uv add duckduckgo-search httpx beautifulsoup4
```

---

## Phases

### Phase 1 — Core backend: search + scrape ✅

- [x] Create `apps/researcher/` Django app, register in `INSTALLED_APPS`
- [x] `search.py` — DDGClient wrapper with text(), news(), videos(), images() methods
- [x] `scraper.py` — fetch URL, strip boilerplate, return clean text
- [x] `services.py` — orchestrate search + scrape, supports "web", "news", "video", "image", "all" types
- [x] Unit tests: `test_ddg_client.py`, `test_scraper.py`, `test_search.py`, `test_services.py` (all network mocked)

### Phase 2 — Backend API endpoint ✅

- [x] `serializers.py` — `SearchRequestSerializer`, `SearchResultSerializer` (with type-specific fields for news, video, image)
- [x] `views.py` — `SearchView(APIView)` with `IsAuthenticated`
- [x] `urls.py` — `POST /api/researcher/search/`
- [x] Register URL in `core/urls.py`
- [x] Integration tests: `test_views.py` (mocked network, real endpoint)

### Phase 3 — React frontend ✅

- [x] `src/types/researcher.ts` — `SearchRequest`, `SearchResult` discriminated union with type-specific interfaces
- [x] `src/api/researcher.ts` — `runSearch(payload)` Axios call
- [x] `src/api/queryKeys.ts` — `researcher` key namespace added
- [x] `src/schemas/researcher.ts` — Zod schema for search form
- [x] `src/hooks/useResearcher.ts` — `useRunSearch()` mutation hook
- [x] `src/routes/researcher.tsx` — layout wrapper + sidebar nav (`<Outlet>`)
- [x] `src/routes/researcher.search.tsx` — search form + results page with multi-type filtering
- [x] `src/components/researcher/ResearchResultCard.tsx` — dispatcher + `NewsResultCard`, `VideoResultCard`, `ImageResultCard` variants
- [x] Add "Researcher" nav link to `AppLayout` sidebar (via `navItems.ts`)

### Phase 4 — Frontend tests ✅

- [x] `useResearcher.test.ts` — mutation hook unit tests (Axios mocked)
- [x] `ResearchResultCard.test.tsx` — render + expand/collapse interaction (all 4 card variants tested)
- [x] `researcher.search.test.tsx` — form submit → results list renders

---

## Backend module design

### `apps/researcher/search.py`

```python
from duckduckgo_search import DDGS


def search(query: str, max_results: int = 5) -> list[dict]:
    with DDGS() as ddgs:
        return list(ddgs.text(query, max_results=max_results))
    # returns: [{ "title", "href", "body" }, ...]
```

### `apps/researcher/scraper.py`

```python
import httpx
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": "Mozilla/5.0"}


def scrape(url: str, max_chars: int = 8000) -> str:
    try:
        resp = httpx.get(url, headers=HEADERS, follow_redirects=True, timeout=10)
        resp.raise_for_status()
    except Exception as e:
        return f"[scrape failed: {e}]"

    soup = BeautifulSoup(resp.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()

    lines = [ln for ln in soup.get_text(separator="\n", strip=True).splitlines() if ln.strip()]
    return "\n".join(lines)[:max_chars]
```

### `apps/researcher/services.py`

```python
from .search import search
from .scraper import scrape


def run_search(query: str, max_results: int = 5) -> list[dict]:
    results = search(query, max_results=max_results)
    return [
        {
            "title": r["title"],
            "url": r["href"],
            "snippet": r["body"],
            "scraped_text": scrape(r["href"]),
        }
        for r in results
    ]
```

### `apps/researcher/serializers.py`

```python
from rest_framework import serializers


class SearchRequestSerializer(serializers.Serializer):
    query = serializers.CharField(min_length=1, max_length=500)
    max_results = serializers.IntegerField(default=5, min_value=1, max_value=20)


class SearchResultSerializer(serializers.Serializer):
    title = serializers.CharField()
    url = serializers.URLField()
    snippet = serializers.CharField()
    scraped_text = serializers.CharField()
```

### `apps/researcher/views.py`

```python
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .serializers import SearchRequestSerializer, SearchResultSerializer
from .services import run_search


class SearchView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        req = SearchRequestSerializer(data=request.data)
        req.is_valid(raise_exception=True)
        results = run_search(**req.validated_data)
        return Response(SearchResultSerializer(results, many=True).data)
```

### `apps/researcher/urls.py`

```python
from django.urls import path
from .views import SearchView

urlpatterns = [
    path("search/", SearchView.as_view(), name="researcher-search"),
]
```

---

## Backend project structure

```
apps/researcher/
├── __init__.py
├── apps.py
├── search.py
├── scraper.py
├── services.py
├── serializers.py
├── views.py
├── urls.py
└── tests/
    ├── __init__.py
    ├── test_search.py
    ├── test_scraper.py
    └── test_views.py
```

---

## Frontend module design

### `src/types/researcher.ts`

```ts
export interface SearchRequest {
  query: string;
  max_results?: number;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  scraped_text: string;
}
```

### `src/api/researcher.ts`

```ts
import apiClient from "@/api/client";
import type { SearchRequest, SearchResult } from "@/types/researcher";

export async function runSearch(payload: SearchRequest): Promise<SearchResult[]> {
  const { data } = await apiClient.post<SearchResult[]>("/api/researcher/search/", payload);
  return data;
}
```

### `src/api/queryKeys.ts` — addition

```ts
researcher: {
  search: (query: string) => ["researcher", "search", query] as const,
},
```

### `src/schemas/researcher.ts`

```ts
import { z } from "zod";

export const searchSchema = z.object({
  query: z.string().min(1, "Query is required").max(500),
  max_results: z.coerce.number().int().min(1).max(20).default(5),
});

export type SearchSchema = z.infer<typeof searchSchema>;
```

### `src/hooks/useResearcher.ts`

```ts
import { useMutation } from "@tanstack/react-query";
import { runSearch } from "@/api/researcher";

export function useRunSearch() {
  return useMutation({ mutationFn: runSearch });
}
```

### `src/routes/researcher.tsx` — layout wrapper

```tsx
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/researcher")({
  component: ResearcherLayout,
});

function ResearcherLayout() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Researcher</h1>
      <Outlet />
    </div>
  );
}
```

### `src/routes/researcher.search.tsx` — search form + results

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { searchSchema, type SearchSchema } from "@/schemas/researcher";
import { useRunSearch } from "@/hooks/useResearcher";
import { ResearchResultCard } from "@/components/researcher/ResearchResultCard";
import { Button } from "@/components/ui/button";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/researcher/search")({
  component: ResearcherSearchPage,
});

function ResearcherSearchPage() {
  const search = useRunSearch();
  const form = useForm<SearchSchema>({ resolver: zodResolver(searchSchema) });

  function onSubmit(values: SearchSchema) {
    search.mutate(values);
  }

  return (
    <div className="flex flex-col gap-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 max-w-xl">
          <FormField
            control={form.control}
            name="query"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Search query</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Australian climate policy 2024" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="max_results"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max results (1–20)</FormLabel>
                <FormControl>
                  <Input type="number" min={1} max={20} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={search.isPending}>
            {search.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Search
          </Button>
        </form>
      </Form>

      {search.isError && (
        <p className="text-destructive text-sm">Search failed — please try again.</p>
      )}

      {search.isSuccess && search.data.length === 0 && (
        <p className="text-muted-foreground text-sm">No results found.</p>
      )}

      {search.isSuccess && (
        <ul className="flex flex-col gap-4">
          {search.data.map((result, i) => (
            <ResearchResultCard key={result.url} result={result} rank={i + 1} />
          ))}
        </ul>
      )}
    </div>
  );
}
```

### `src/components/researcher/ResearchResultCard.tsx`

```tsx
import { useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SearchResult } from "@/types/researcher";

interface ResearchResultCardProps {
  result: SearchResult;
  rank: number;
}

export function ResearchResultCard({ result, rank }: ResearchResultCardProps) {
  const [expanded, setExpanded] = useState(false);
  const scrapeFailed = result.scraped_text.startsWith("[scrape failed");

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 pb-2">
        <Badge variant="outline">{rank}</Badge>
        <div className="flex flex-col gap-1">
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            {result.title}
          </a>
          <span className="text-xs text-muted-foreground break-all">{result.url}</span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{result.snippet}</p>
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Hide scraped text" : "Show scraped text"}
        </Button>
        {expanded && (
          <pre
            className={cn(
              "text-xs whitespace-pre-wrap bg-muted rounded-md p-3 max-h-64 overflow-y-auto",
              scrapeFailed && "text-destructive"
            )}
          >
            {result.scraped_text}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## Frontend project structure

```
src/
├── api/
│   └── researcher.ts          # runSearch() Axios call
├── components/
│   └── researcher/
│       └── ResearchResultCard.tsx
├── hooks/
│   └── useResearcher.ts       # useRunSearch() mutation
├── routes/
│   ├── researcher.tsx          # layout wrapper + Outlet
│   └── researcher.search.tsx   # form + results page
├── schemas/
│   └── researcher.ts           # Zod searchSchema
└── types/
    └── researcher.ts           # SearchRequest, SearchResult
```

---

## Testing

### Backend unit tests

**`tests/test_search.py`** — mock `DDGS` context manager:
```python
from unittest.mock import MagicMock, patch
from apps.researcher.search import search

def test_search_returns_results():
    mock_results = [{"title": "T", "href": "https://example.com", "body": "B"}]
    with patch("apps.researcher.search.DDGS") as MockDDGS:
        MockDDGS.return_value.__enter__.return_value.text.return_value = mock_results
        results = search("test query", max_results=1)
    assert results == mock_results

def test_search_respects_max_results():
    with patch("apps.researcher.search.DDGS") as MockDDGS:
        MockDDGS.return_value.__enter__.return_value.text.return_value = []
        search("q", max_results=3)
        MockDDGS.return_value.__enter__.return_value.text.assert_called_once_with("q", max_results=3)
```

**`tests/test_scraper.py`** — mock `httpx.get`:
```python
from unittest.mock import MagicMock, patch
from apps.researcher.scraper import scrape

def test_scrape_returns_clean_text():
    mock_resp = MagicMock()
    mock_resp.text = "<html><body><p>Hello world</p><script>bad()</script></body></html>"
    mock_resp.raise_for_status.return_value = None
    with patch("apps.researcher.scraper.httpx.get", return_value=mock_resp):
        result = scrape("https://example.com")
    assert "Hello world" in result
    assert "bad()" not in result

def test_scrape_returns_failure_string_on_error():
    with patch("apps.researcher.scraper.httpx.get", side_effect=Exception("timeout")):
        result = scrape("https://example.com")
    assert result.startswith("[scrape failed")

def test_scrape_respects_max_chars():
    mock_resp = MagicMock()
    mock_resp.text = f"<p>{'x' * 10000}</p>"
    mock_resp.raise_for_status.return_value = None
    with patch("apps.researcher.scraper.httpx.get", return_value=mock_resp):
        result = scrape("https://example.com", max_chars=100)
    assert len(result) <= 100
```

**`tests/test_views.py`** — DRF `APIClient`, mock `run_search`:
```python
import pytest
from unittest.mock import patch
from django.urls import reverse
from rest_framework.test import APIClient
from apps.accounts.tests.factories import UserFactory

MOCK_RESULTS = [
    {"title": "T", "url": "https://example.com", "snippet": "S", "scraped_text": "Text"},
]

@pytest.fixture
def auth_client(db):
    user = UserFactory.create()
    client = APIClient()
    client.force_authenticate(user=user)
    return client

def test_search_returns_200(auth_client):
    with patch("apps.researcher.views.run_search", return_value=MOCK_RESULTS):
        resp = auth_client.post(
            "/api/researcher/search/",
            {"query": "test", "max_results": 1},
            format="json",
        )
    assert resp.status_code == 200
    assert resp.data[0]["title"] == "T"

def test_search_requires_auth():
    resp = APIClient().post("/api/researcher/search/", {"query": "test"}, format="json")
    assert resp.status_code == 401

def test_search_validates_empty_query(auth_client):
    with patch("apps.researcher.views.run_search", return_value=[]):
        resp = auth_client.post("/api/researcher/search/", {"query": ""}, format="json")
    assert resp.status_code == 400
```

### Frontend unit tests

**`useResearcher.test.ts`** — mock Axios at module level:
```ts
import { vi, it, expect, describe } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useRunSearch } from "@/hooks/useResearcher";
import * as researcherApi from "@/api/researcher";
import { createTestWrapper } from "@/test/setup";

vi.mock("@/api/researcher");

describe("useRunSearch", () => {
  it("calls runSearch with the correct payload", async () => {
    const mockData = [{ title: "T", url: "https://example.com", snippet: "S", scraped_text: "X" }];
    vi.mocked(researcherApi.runSearch).mockResolvedValue(mockData);

    const { result } = renderHook(() => useRunSearch(), { wrapper: createTestWrapper() });

    act(() => result.current.mutate({ query: "test", max_results: 3 }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(researcherApi.runSearch).toHaveBeenCalledWith({ query: "test", max_results: 3 });
  });
});
```

**`ResearchResultCard.test.tsx`**:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResearchResultCard } from "@/components/researcher/ResearchResultCard";

const result = {
  title: "Example Article",
  url: "https://example.com",
  snippet: "A short summary.",
  scraped_text: "Full scraped content here.",
};

it("renders title, URL, and snippet", () => {
  render(<ResearchResultCard result={result} rank={1} />);
  expect(screen.getByText("Example Article")).toBeInTheDocument();
  expect(screen.getByText("https://example.com")).toBeInTheDocument();
  expect(screen.getByText("A short summary.")).toBeInTheDocument();
});

it("hides scraped text by default", () => {
  render(<ResearchResultCard result={result} rank={1} />);
  expect(screen.queryByText("Full scraped content here.")).not.toBeInTheDocument();
});

it("expands and collapses scraped text on button click", async () => {
  render(<ResearchResultCard result={result} rank={1} />);
  await userEvent.click(screen.getByRole("button", { name: /show scraped text/i }));
  expect(screen.getByText("Full scraped content here.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /hide scraped text/i }));
  expect(screen.queryByText("Full scraped content here.")).not.toBeInTheDocument();
});
```

**`researcher.search.test.tsx`** — form submit → results:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import * as researcherApi from "@/api/researcher";
import { ResearcherSearchPage } from "@/routes/researcher.search";
import { createTestWrapper } from "@/test/setup";

vi.mock("@/api/researcher");

it("submits form and renders result cards", async () => {
  vi.mocked(researcherApi.runSearch).mockResolvedValue([
    { title: "Hit 1", url: "https://hit1.com", snippet: "Snip", scraped_text: "Body" },
  ]);

  render(<ResearcherSearchPage />, { wrapper: createTestWrapper() });

  await userEvent.type(screen.getByLabelText(/search query/i), "climate");
  await userEvent.click(screen.getByRole("button", { name: /search/i }));

  await waitFor(() => expect(screen.getByText("Hit 1")).toBeInTheDocument());
  expect(screen.getByText("https://hit1.com")).toBeInTheDocument();
});
```

### Manual verification

1. Start backend + Redis and visit `/api/schema/swagger-ui/`
2. `POST /api/researcher/search/` with `{"query": "open source AI", "max_results": 3}`
3. Verify response contains `title`, `url`, `snippet`, `scraped_text` for each result
4. Log in via the frontend, navigate to `/researcher/search`
5. Enter a query and click Search — results should appear with expandable scraped text panels

---

## Risks & Notes

- DuckDuckGo rate-limits aggressive scraping — add a per-request delay if needed
- Some pages block scrapers; `scrape()` returns a `[scrape failed: ...]` string on error — `ResearchResultCard` renders it in destructive colour so it's visible, not silently hidden
- `max_chars=8000` is a soft ceiling; tune based on downstream context window requirements
- This endpoint is intentionally synchronous — for large `max_results` values it will be slow; if latency becomes a problem, move to a Celery task (similar to `embeddings.ingest_document`)

---

## Flow summary

```
User fills form  →  POST /api/researcher/search/  {query, max_results}
                      → DuckDuckGo search  →  N result metadata dicts
                      → scrape each URL    →  clean text (trimmed to 8k chars)
                      → return             →  [{title, url, snippet, scraped_text}, ...]
Frontend renders ResearchResultCard per result
User clicks "Show scraped text" to see full page content
```