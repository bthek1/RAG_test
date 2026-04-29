# AGENTS.md — Coding Conventions & Commands

This document guides agentic coding systems operating in this monorepo.

---

## Quick Commands
### All-in-One

| Command | Purpose |
|---------|------|
| `just dev` | Start backend (8004) + frontend (5174) + Celery concurrently (starts DB/Redis via Docker first) |
| `just install` | Install all backend + frontend dependencies |
| `just db-up` | Start only DB + Redis containers |
### Backend (Django + Python 3.13)

| Command | Purpose |
|---------|---------|
| `just be-install` | Install dependencies via `uv` |
| `just be-lint` | Run `ruff check .` |
| `just be-fmt` | Run `ruff format .` |
| `just be-test` | Run full test suite |
| `just be-test-cov` | Run tests with coverage |
| **Single test** | `cd backend && uv run pytest apps/accounts/tests/test_models.py::TestUser::test_email` |
| `just be-migrate` | Apply migrations |
| `just be-makemigrations [app]` | Create migrations |
| Type check | `cd backend && uv run mypy .` |
| `just be-celery` | Start Celery worker locally (requires Redis) |
| `just be-beat` | Start Celery Beat scheduler locally |
| `just be-flower` | Start Flower dashboard locally (port 5555) |
| `just celery-up` | Start celery_worker via Docker Compose |

### Frontend (React + TypeScript)

| Command | Purpose |
|---------|---------|
| `just fe-install` | Install dependencies via npm |
| `just fe-lint` | Run ESLint |
| `just fe-build` | Build for production |
| `just fe-test` | Run full test suite |
| **Single test** | `cd frontend && npm test -- src/components/Button.test.tsx` |
| `just fe-test-ui` | Run tests with Vitest UI |
| `just fe-dev` | Start Vite dev server |

---

## Backend Code Style

**Python, Django 5.1+, Django REST Framework**

### Imports & Organization
- Imports in order: stdlib → third-party → local (isort)
- Use `from django.contrib.auth import get_user_model` — never import `User` directly
- All endpoints prefixed with `/api/`

### Models & Database
- Primary keys: `models.UUIDField(default=uuid.uuid4, editable=False)`
- Always use `select_related()` / `prefetch_related()` to avoid N+1 queries
- Use `bulk_create()` / `bulk_update()` for batch operations
- Never hardcode secrets or DB credentials — use `django-environ`
- Auth model: `AUTH_USER_MODEL = "accounts.CustomUser"` (email-based, no username field)

### Views & Serializers
- Class-based views only (`APIView`, `generics.*`, `ViewSet`) — no function-based views
- Never put business logic in views — extract to `services.py`
- Serializers in `serializers.py`, business logic in `services.py`
- Use DRF's `Response` — never `JsonResponse`
- Use `get_object_or_404` and DRF exception handling — no raw try/except for HTTP errors

### Code Quality
- **Line length:** 88 characters (ruff)
- **Quotes:** Double quotes
- **Formatting:** `ruff format` (non-negotiable)
- **Linting:** `ruff check` with comprehensive rules (see pyproject.toml for full config)
- **Type checking:** `mypy` (strict mode)

### Naming Conventions
- Models: PascalCase (`CustomUser`, `BlogPost`)
- Functions/methods: snake_case (`get_user_profile`, `create_token`)
- Constants: UPPER_SNAKE_CASE (`MAX_RETRIES`, `API_TIMEOUT`)
- Private methods: prefix with `_` (`_validate_email`)

### Error Handling
- No bare `except:` — be specific
- Use DRF exceptions (`ValidationError`, `NotFound`, `PermissionDenied`)
- Return meaningful error messages in serializer validation
- Use `raise Http404()` or `get_object_or_404()` for missing resources

### Testing
- Test file naming: `test_*.py` or `*_test.py`
- Use `factory-boy` + `faker` for fixtures
- Use `freezegun` for time mocking
- Fixtures in `conftest.py` (app-level or `backend/conftest.py`)
- Test markers: `slow`, `integration`, `development`

---

## Frontend Code Style

**React 18, TypeScript (strict), Vite**

### Imports & Organization
- Always use `@/` alias (resolves to `src/`) — never relative imports (`../../`)
- Example: `import { cn } from '@/lib/utils'` not `import { cn } from '../../../lib/utils'`
- Imports in order: react/external → `@/` alias paths → same folder

### Components & Hooks
- Functional components only — no class components
- No business logic in components — extract to `src/hooks/`
- Co-locate tests next to components: `Button.test.tsx` beside `Button.tsx`
- Use `cn()` from `src/lib/utils.ts` for conditional class merging (wraps clsx + tailwind-merge)

### TypeScript
- Strict mode — no `any` type
- Define API response types in `src/types/` from API contracts
- Use Zod schemas in `src/schemas/` for validation (one file per domain)

### State Management
- **Server state:** TanStack Query exclusively (`useQuery`, `useMutation`, `useInfiniteQuery`)
- **Global/UI state:** Zustand stores in `src/store/` (one file per concern)
- **Local state:** `useState` / `useReducer`
- **CRITICAL:** Never put server-fetched data in Zustand — that belongs in TanStack Query
- Zustand: always use `immer` middleware for mutations

### API & Data Fetching
- All calls through `src/api/client.ts` (Axios with JWT interceptor)
- Query keys defined as constants in `src/api/queryKeys.ts`
- Mutations must invalidate relevant queries on success

### Styling
- **Tailwind CSS v4:** CSS-first, `@import "tailwindcss"` in `src/index.css` — no `tailwind.config.js`
- **shadcn/ui:** Install with `npx shadcn@latest add <component>`, never modify generated files directly
- shadcn/ui uses CSS variables for theming — do not override with arbitrary Tailwind values

### Routing
- File-based routes under `src/routes/` using TanStack Router
- Routes are type-safe — use `useParams()`, `useSearch()` from TanStack Router
- Loaders fetch data before render using QueryClient

### Code Quality
- **Linting:** ESLint (TypeScript + React Hooks + React Refresh rules)
- **Type checking:** Enabled via `build: tsc -b && vite build`
- **Formatting:** Handled by ESLint (no separate formatter)

### Naming Conventions
- Components: PascalCase (`Button`, `UserProfile`, `LoginForm`)
- Hooks: camelCase, prefix with `use` (`useUser`, `usePaginationState`)
- Functions/utilities: camelCase (`formatDate`, `calculateTotal`)
- Constants: UPPER_SNAKE_CASE (`API_BASE_URL`, `MAX_RESULTS`)
- Store names: `useXStore` pattern (`useUIStore`, `useAuthStore`)

### Error Handling
- Handle async errors in mutation/query callbacks
- Display user-friendly error messages (avoid exposing internals)
- Log errors to console only in development (`import.meta.env.DEV`)
- Never swallow errors silently

### Testing
- Test environment: `jsdom` (configured in `vite.config.ts`)
- Setup file: `src/test/setup.ts` (imports `@testing-library/jest-dom`)
- Mock Axios at module level — never make real HTTP calls in tests
- Zod schemas: test as pure unit tests (no DOM needed)
- Run: `just fe-test` or `cd frontend && npm test`

### Utilities
- Date formatting: always via `src/lib/date.ts` wrappers, never call `date-fns` directly in components
- Charts: always via `src/components/charts/PlotlyChart.tsx` (lazy-loaded), never use plotly directly

### Environment Variables
- Prefix with `VITE_`, access via `import.meta.env.VITE_*`
- Never hardcode API URLs — use env vars

---

## Absolute Don'ts

**Git — NEVER do without explicit user confirmation:**
- `git commit` — never commit on user's behalf
- `git push` / `git push --force` — never push
- `git reset --hard`, `git rebase`, `git merge` on shared branches
- `git branch -D` — never delete branches

**File system:**
- `rm -rf` on non-temporary directories
- Delete migration files manually

**Infrastructure:**
- `docker compose down -v` (destroys volumes)
- Modify `.env` files in-place

**Database:**
- Run raw SQL queries without parameterization
- Delete or truncate tables directly

---

## Environment Setup

See `.github/copilot-instructions.md` for:
- Full monorepo architecture and structure
- Complete stack details and justifications
- Docker Compose setup (`services: db, backend, frontend`)
- Planning rules for feature implementation
- Docs structure and requirements

---

## Testing Best Practices

**Backend:**
- Use factory-boy for test data: `UserFactory.create(email='test@example.com')`
- Freeze time: `@freeze_time('2024-01-01')` 
- Run specific test: `uv run pytest apps/accounts/tests/test_views.py::TestTokenView::test_post_valid_credentials -v`

**Frontend:**
- Mock API calls at module level: `vi.mock('@/api/client')`
- Use `render()` from React Testing Library for components
- Test user interactions: `userEvent.click()`, `userEvent.type()`
- Run specific test: `npm test -- Button.test.tsx -t "renders correctly"`

---

## Structure Overview

```
/
├── backend/              Django REST API (Python 3.13)
│   ├── core/settings/    base.py, dev.py, prod.py, test.py
│   ├── apps/             Domain applications (accounts, embeddings, chat, researcher)
│   ├── conftest.py       Root pytest fixtures
│   └── pyproject.toml    Dependencies, pytest & ruff config
├── frontend/             React SPA (TypeScript, Vite)
│   ├── src/
│   │   ├── api/          Axios client, query keys
│   │   ├── components/   React components + UI
│   │   ├── hooks/        Custom hooks (business logic)
│   │   ├── routes/       TanStack Router file-based routes
│   │   ├── schemas/      Zod validation schemas
│   │   ├── store/        Zustand state stores
│   │   ├── types/        TypeScript types from API contracts
│   │   └── lib/          Utilities (cn(), date wrappers)
│   └── package.json
├── docs/                 Knowledge base (standards, guides, plans, explanations)
├── justfile              Task runner — use `just --list`
└── README.md             Quick start guide
```

---

## See Also

- [`.github/copilot-instructions.md`](.github/copilot-instructions.md) — Full conventions and architecture
- [`.github/agents/backend.agent.md`](.github/agents/backend.agent.md) — Focused backend agent (Django, DRF, Celery, RAG)
- [`.github/agents/frontend.agent.md`](.github/agents/frontend.agent.md) — Focused frontend agent (React, TanStack, Tailwind)
- [`docs/standards/api-contracts.md`](docs/standards/api-contracts.md) — API endpoint specifications
- [`docs/guides/local-setup.md`](docs/guides/local-setup.md) — Development environment setup
- [`docs/explanations/architecture.md`](docs/explanations/architecture.md) — Architecture overview
- [`docs/explanations/pgvector.md`](docs/explanations/pgvector.md) — pgvector / RAG pipeline details
