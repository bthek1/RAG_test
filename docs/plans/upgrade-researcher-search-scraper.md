# Plan: Upgrade researcher search & scraper to class wrappers

**Status:** Complete
**Date:** 2026-04-01
**Last Updated:** 2026-04-01

## Goal

Replace the current function-based utilities in `backend/apps/researcher/search.py` and `backend/apps/researcher/scraper.py` with small, well-typed class wrappers:

- `DDGClient` — a wrapper around `duckduckgo_search.DDGS` exposing `text`, `news`, `video`, `images` (etc.) methods.
- `Scraper` — a BeautifulSoup-based wrapper that centralizes HTTP settings, error handling, and text extraction.

This will improve testability, dependency injection, configuration (timeouts, headers), and make it straightforward to extend results (videos/images/news) and UI features.

## Background

Current state:

- `backend/apps/researcher/search.py` exports a `search(query, max_results=5)` function that uses `DDGS()` and returns raw DDG results.
- `backend/apps/researcher/scraper.py` exports a `scrape(url, max_chars=8000)` function that uses `httpx` + `BeautifulSoup` to extract plain text.

Problems & motivations:

- Hard to mock/override `DDGS()` and `httpx` calls in unit tests.
- Adding other result types (news, video, images) requires duplicating code or adding per-use wrappers.
- No place to centralize headers, timeouts, retry policies, or rate-limiting.

## Phases

### Phase 1 — Design (0.5–1 day)

- Define class APIs and file layout.
- Decide on default file locations:
  - `backend/apps/researcher/ddg_client.py` (new)
  - `backend/apps/researcher/scraper.py` (convert function to class in-place)
  - Keep `backend/apps/researcher/search.py` as a thin facade that imports/forwards to `DDGClient` to maintain backward compatibility.
- Define return shape (list[dict] with keys `title`, `href`, `body`, `type`), and error-handling policy.

Deliverable: agreed method signatures and example usage.

Suggested signatures:

```py
class DDGClient:
    def __init__(self, max_results: int = 10, ddgs_options: dict | None = None):
        ...

    def text(self, query: str, max_results: int | None = None) -> list[dict]:
        ...

    def news(self, query: str, max_results: int | None = None) -> list[dict]:
        ...

    def video(self, query: str, max_results: int | None = None) -> list[dict]:
        ...

    def images(self, query: str, max_results: int | None = None) -> list[dict]:
        ...

class Scraper:
    def __init__(self, headers: dict | None = None, timeout: float = 10.0, parser: str = "html.parser"):
        ...

    def scrape(self, url: str, max_chars: int = 8000) -> str:
        ...
```

### Phase 2 — Implementation (1–2 days)

- Implement `DDGClient` in `ddg_client.py` using context manager `with DDGS() as ddgs:` for each method.
- Implement `Scraper` class in `scraper.py` (convert existing module into class-based API while keeping a small top-level helper for quick calls).
- Add well-typed docstrings and runtime option for `parser` (allow `lxml` if available).
- Ensure both classes return predictable shapes and handle exceptions gracefully (log + return empty list / sentinel error dict).

Implementation notes for `DDGClient`:

- Wrap `DDGS()` calls in try/except, normalise output to consistent dict keys.
- Accept `ddgs_options` to pass through to the underlying call if the library supports it.
- Consider adding an optional persistent `DDGS` instance to reuse across calls if the library supports reuse and is safe.

Implementation notes for `Scraper`:

- Use `httpx.get(..., timeout=self.timeout, headers=self.headers)`.
- Use `BeautifulSoup(resp.text, self.parser)` and remove non-content tags (`script`, `style`, `nav`, `footer`, `header`, `aside`).
- Return a truncated string up to `max_chars`.
- Add a method `extract_text` that can be reused for HTML snippets.

### Phase 3 — Backwards compatibility & refactor (0.5–1 day)

- Keep a small facade in `backend/apps/researcher/search.py` that imports `DDGClient` and exposes the old `search()` function signature:

```py
from .ddg_client import DDGClient

def search(query: str, max_results: int = 5):
    return DDGClient(max_results=max_results).text(query, max_results=max_results)
```

- Run a repo search for references to the old function (e.g., `from researcher.search import search`, or direct imports) and update them where appropriate to instantiate `DDGClient` or use the facade.
- Prefer small, focused refactors — change callers only when they need new capabilities (news/video/images).

### Phase 4 — Frontend/UI updates (1–2 days) ✅ Complete (2026-04-01)

- Audit frontend code that depends on the previous search result shape (likely `frontend/src/api/` and components under `frontend/src/components/`).
- If the backend API payload shape is preserved (via the facade), no frontend changes are strictly required. If we add new result types (video/images/news), add/extend UI components to present them:
  - Video: embed or provide thumbnail + link.
  - Images: show a small gallery or thumbnail list.
  - News: show source + published date if available.
- Update API client types in `frontend/src/types/` and any Zod schemas if used.

#### Frontend implementation & upgrade steps

- Audit current `researcher` frontend implementation to identify all consumers of the existing search result shape. Key files to check and update:
  - `frontend/src/api/researcher.ts` — update request/response typing and endpoint if backend shape changes.
  - `frontend/src/types/researcher.ts` — expand `SearchResult` to include a `type` discriminator and optional fields such as `thumbnail_url`, `video_url`, `source`, `published_at`, and `content`/`scraped_text`.
  - `frontend/src/hooks/useResearcher.ts` — continue to use `useMutation` but adapt mutation success handling if payload shape changes.
  - `frontend/src/components/researcher/ResearchResultCard.tsx` — make card type-aware (render media for `video`/`image`, show `source` & `published_at` for `news`, keep `snippet` + expandable `scraped_text`).
  - `frontend/src/routes/researcher.search.tsx` — ensure form fields map to the updated API (e.g., enable selecting result types in the UI in a future iteration).

- UI design guidance:
  - Keep the default list view unchanged for backwards compatibility.
  - For `image` results show a thumbnail grid inside the card (lazy-loaded). Clicking a thumbnail opens a lightbox/modal.
  - For `video` results show a thumbnail + play button; clicking opens an embedded player (or links to external host). Avoid autoplay.
  - For `news` results include publisher and published date above the snippet.
  - Maintain the expandable `scraped_text` block; mark errors (e.g. `"[scrape failed"`) visually as currently implemented.

- Types & validation:
  - Extend `frontend/src/schemas/researcher.ts` (Zod) if adding new search filters (e.g., `type` or `source`).
  - Update `frontend/src/types/researcher.ts` with a discriminated union for `SearchResult`:

```ts
export type SearchResultBase = {
  title: string;
  url: string;
  snippet: string;
  scraped_text?: string;
};

export type WebResult = SearchResultBase & { type: "web" };
export type NewsResult = SearchResultBase & { type: "news"; source?: string; published_at?: string };
export type VideoResult = SearchResultBase & { type: "video"; video_url?: string; thumbnail_url?: string };
export type ImageResult = SearchResultBase & { type: "image"; images?: string[] };

export type SearchResult = WebResult | NewsResult | VideoResult | ImageResult;
```

- Backwards compatibility strategy:
  - Keep the backend `search()` facade returning the legacy flat shape for one release to avoid breaking the frontend.
  - Introduce a new field (`type`) and optional media fields incrementally. Update the frontend to tolerate both shapes (use optional chaining and sensible fallbacks).

- Testing & rollout for frontend:
  - Add unit tests for `ResearchResultCard` rendering each `type` variant.
  - Mock `api/researcher.ts` in component tests to return mixed-type results.
  - Feature-flag or behind a staged release if the UI changes are significant.

#### ✅ Frontend implemented (2026-04-01)

All planned frontend files created and tested:

| File | Status |
|---|---|
| `src/types/researcher.ts` | ✅ `SearchRequest` + `SearchResult` interfaces |
| `src/schemas/researcher.ts` | ✅ Zod schema (`query` min 1/max 500, `max_results` coerced 1–20, default 5) |
| `src/api/researcher.ts` | ✅ `runSearch()` → `POST /api/researcher/search/` via `apiClient` |
| `src/hooks/useResearcher.ts` | ✅ `useRunSearch()` mutation hook |
| `src/hooks/useResearcher.test.ts` | ✅ Vitest: success, error, pending states |
| `src/components/researcher/ResearchResultCard.tsx` | ✅ Rank badge, title link, snippet, collapsible scraped text, `[scrape failed` detection |
| `src/components/researcher/ResearchResultCard.test.tsx` | ✅ Component tests |
| `src/routes/researcher.tsx` | ✅ Layout route with `<Outlet />` |
| `src/routes/researcher.search.tsx` | ✅ Search page with RHF+Zod form, loading spinner, empty state, result cards |
| `src/routes/researcher.search.test.tsx` | ✅ Form render, submit+results, empty state tests |

Note: `SearchResult` type currently uses the flat `{title, url, snippet, scraped_text}` shape returned by the backend facade. The discriminated union (`WebResult | NewsResult | VideoResult | ImageResult`) is deferred until the backend exposes multi-type results.

### Phase 5 — Tests, docs, rollout (1 day)

- Unit tests:
  - Mock `duckduckgo_search.DDGS` to return deterministic results and test `DDGClient` methods.
  - Use `respx` (or `pytest-httpx`) to mock `httpx` responses and test `Scraper` extraction.
- Integration tests:
  - End-to-end backend tests exercising endpoints that use search/scraper.
- Docs:
  - Update `docs/` and module docstrings with examples.
- Rollout:
  - Deploy to a staging environment and run smoke tests.
  - Monitor logs for scraper/DDG errors and rate-limit issues.

#### ✅ Tests written and passing (2026-04-01) — 37/37 backend + frontend tests

All backend unit and integration tests are written and passing. Run with:

```
cd backend && uv run pytest apps/researcher/tests/ -v
```

**`tests/test_search.py`** (4 tests — all pass):
- `test_search_returns_results` — verifies `search()` returns results from mocked `DDGS`.
- `test_search_respects_max_results` — asserts `DDGS.text` called with correct `max_results`.
- `test_search_returns_empty_list_when_no_results` — graceful empty result handling.
- `test_search_passes_max_results_to_ddgs[1/5/20]` — parametrised over common values.

**`tests/test_scraper.py`** (5 tests — all pass):
- `test_scrape_returns_clean_text` — confirms `<script>` content stripped, `<p>` content retained.
- `test_scrape_strips_nav_footer_header_aside` — all layout tags removed from output.
- `test_scrape_returns_failure_string_on_error` — exception produces `[scrape failed: ...]` sentinel.
- `test_scrape_respects_max_chars` — output truncated at `max_chars` boundary.
- `test_scrape_uses_correct_headers` — `User-Agent` header forwarded to `httpx.get`.

**`tests/test_views.py`** (8 integration tests — all pass, using `@pytest.mark.django_db`):
- `test_search_returns_200` — happy path returns 200 with expected result shape.
- `test_search_returns_all_fields` — response includes `title`, `url`, `snippet`, `scraped_text`.
- `test_search_requires_auth` — unauthenticated request returns 401.
- `test_search_validates_empty_query` — empty `query` returns 400.
- `test_search_validates_missing_query` — missing `query` field returns 400.
- `test_search_default_max_results` — omitting `max_results` defaults to 5 and calls `run_search` correctly.
- `test_search_validates_max_results_too_high` — `max_results > 20` returns 400.
- `test_search_returns_empty_list_when_no_results` — 200 with `[]` payload when no results found.

## Testing

- Unit tests for `DDGClient` methods verifying:
  - Correct call into `DDGS` with provided parameters.
  - Normalisation of result keys.
  - Graceful handling of exceptions.

- Unit tests for `Scraper` verifying:
  - Removal of `script`/`style`/layout tags.
  - Correct truncation at `max_chars`.
  - Handling of non-2xx responses and timeouts.

- Integration tests for any public endpoints using the search/scraper changes.

Suggested test tools: `pytest`, `pytest-mock`, `respx` (or `pytest-httpx`), built-in `unittest.mock` for `DDGS`.

### Current test status: ✅ All passing

**Backend (`cd backend && uv run pytest apps/researcher/tests/ -v`)**

| File | Tests | Status |
|------|-------|--------|
| `tests/test_search.py` | 4 | ✅ |
| `tests/test_scraper.py` | 11 | ✅ (5 facade + 6 class) |
| `tests/test_ddg_client.py` | 14 | ✅ (text/news/videos/images/options) |
| `tests/test_views.py` | 8 | ✅ (django_db) |

**Frontend (`cd frontend && npm test`)**

| File | Status |
|---|---|
| `src/hooks/useResearcher.test.ts` | ✅ success / error / pending states |
| `src/components/researcher/ResearchResultCard.test.tsx` | ✅ component rendering |
| `src/routes/researcher.search.test.tsx` | ✅ form render, submit+results, empty state |

## Risks & Notes

- `duckduckgo_search.DDGS` is a community tool; its behaviour may change. Keep the facade thin and document the expected fields.
- Rate-limiting: searches may be throttled by DuckDuckGo; consider adding a sleep/retry or exponential backoff if we see failures.
- Scraping legal/robots considerations: ensure the `Scraper` is used only for allowed sites, and respect `robots.txt` if required by policy.
- HTML parser differences: `html.parser` vs `lxml` may produce different text; document the parser option.

## Rollout & Backout

- Roll out changes behind a small feature flag if the system supports it.
- Keep the `search()` facade in place for at least one release to reduce frontend churn.

## Next steps

All phases complete. Potential future work:

- Expand UI to render media-typed results (video, images, news) once backend returns a `type` discriminator.
- Introduce retry/backoff on `DDGClient` if DuckDuckGo rate-limiting is observed.
- Implement `robots.txt` checking in `Scraper` if required by policy.

---

*Files to be created/edited as part of this plan:*

- `backend/apps/researcher/ddg_client.py` (new)
- `backend/apps/researcher/scraper.py` (convert to class)
- `backend/apps/researcher/search.py` (facade update)
- `frontend` files: update `src/api/*` and components only if payloads change
- `docs/` updates and unit tests in `backend/apps/researcher/tests/`
