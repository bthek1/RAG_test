# Project Specifications

This document consolidates all current technical specifications for the django_react_template monorepo.

---

## Overview

**Type:** Decoupled monorepo (independent frontend + backend)  
**Purpose:** Full-stack web application with JWT authentication  
**Git:** GitHub with conventional commits  
**Deployment:** Docker Compose for local dev, containers for production  

---

## Backend Specifications

### Language & Framework

| Spec | Version |
|------|---------|
| Python | 3.13 |
| Django | 5.1+ |
| Django REST Framework | 3.15+ |
| PostgreSQL | 16 |
| psycopg (DB driver) | 3.2+ |

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `djangorestframework-simplejwt` | 5.3+ | JWT authentication |
| `django-cors-headers` | 4.4+ | CORS support for frontend |
| `django-environ` | 0.11+ | Environment variable management |
| `gunicorn` | 23.0+ | Production WSGI server |
| `psycopg[binary]` | 3.2+ | PostgreSQL adapter |

### Development Tools

| Tool | Version | Purpose |
|------|---------|---------|
| uv | latest | Package manager & virtual env |
| ruff | 0.9+ | Linting & formatting |
| mypy | 1.13+ | Type checking (strict mode) |
| pytest | 8.0+ | Testing framework |
| pytest-django | 4.9+ | Django pytest plugin |
| pytest-cov | 7.0+ | Coverage reporting |
| factory-boy | 3.3+ | Test fixture generation |
| faker | 33.0+ | Fake data generation |
| freezegun | 1.5+ | Time mocking |

### Code Quality Standards

| Rule | Value |
|------|-------|
| Line length | 88 characters |
| Quote style | Double quotes |
| Indentation | 4 spaces |
| Type checking | Strict mode (mypy) |
| Test coverage | Target 80%+ |

### Ruff Linting Rules (selected)

- **E, W, F** — pycodestyle, pyflakes
- **UP** — pyupgrade
- **I** — isort (import sorting)
- **B** — flake8-bugbear
- **PT** — flake8-pytest
- **C4** — comprehensions
- **DJ** — flake8-django
- **N** — pep8-naming
- **S** — bandit (security)
- **SIM** — simplification
- **T10, T20** — debugger/print statements

See `backend/pyproject.toml` for full config.

### Database Configuration

- **Type:** PostgreSQL 16
- **Connection:** Via `DATABASE_URL` env var (psycopg3)
- **Migrations:** Django ORM (`manage.py makemigrations`, `migrate`)
- **Models:** UUIDs as primary keys (`models.UUIDField(default=uuid.uuid4)`)
- **Optimization:** `select_related()`, `prefetch_related()` for N+1 prevention

### Authentication

- **Method:** JWT via `djangorestframework-simplejwt`
- **User Model:** `CustomUser` (email-based, no username)
- **Endpoints:** `POST /api/token/`, `POST /api/token/refresh/`
- **Permission:** `rest_framework.permissions.IsAuthenticated`

### API Standards

| Standard | Requirement |
|----------|-------------|
| Prefix | All endpoints start with `/api/` |
| Response format | DRF's `Response` object (JSON) |
| Error handling | DRF exceptions (`ValidationError`, `NotFound`, etc.) |
| Class-based views | Use `APIView`, `generics.*`, `ViewSet` |
| No function-based views | — |

### Port Mapping

| Service | Port | URL |
|---------|------|-----|
| Django dev server | 8004 (Docker), 8000 (local) | http://localhost:8004/api/ |
| Postgres | 5434 (Docker), 5432 (container) | localhost:5434 |

### File Structure

```
backend/
├── core/                    # Django project settings
│   ├── settings/
│   │   ├── base.py         # Shared config
│   │   ├── dev.py          # Dev overrides
│   │   ├── prod.py         # Production overrides
│   │   └── test.py         # Test config (SQLite, fast hashing)
│   ├── urls.py
│   ├── wsgi.py
│   └── asgi.py
├── apps/                    # Domain applications
│   ├── accounts/           # User model, auth
│   │   ├── models.py
│   │   ├── serializers.py
│   │   ├── services.py
│   │   ├── views.py
│   │   ├── urls.py
│   │   └── tests/
│   └── pages/              # Health check, etc.
├── manage.py
├── pyproject.toml          # Dependencies, tool config
├── conftest.py             # Root pytest fixtures
└── .env.example
```

---

## Frontend Specifications

### Language & Framework

| Spec | Version |
|------|---------|
| TypeScript | 5.6+ |
| React | 18.3+ |
| Vite | 5.4+ |
| Node.js | 20+ |
| npm | 10+ |

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@tanstack/react-router` | 1.166+ | File-based routing |
| `@tanstack/react-query` | 5.90+ | Server state management |
| `axios` | 1.13+ | HTTP client |
| `react-hook-form` | 7.71+ | Form state management |
| `zod` | 4.3+ | Schema validation |
| `zustand` | 5.0+ | Global UI state |
| `tailwindcss` | 4.2+ | Utility-first CSS |
| `shadcn` | 4.0+ | Headless UI components |
| `immer` | 11.1+ | Immutable state updates |
| `date-fns` | 4.1+ | Date utilities |
| `plotly.js` | 3.4+ | Charting library |

### Development Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Vitest | 2.1+ | Test runner (Jest-compatible) |
| @testing-library/react | 16.3+ | Component testing |
| @testing-library/jest-dom | 6.9+ | DOM matchers |
| ESLint | 9.13+ | Linting |
| happy-dom | 20.8+ | Lightweight DOM |
| jsdom | 28.1+ | Full DOM simulation |

### Code Quality Standards

| Rule | Value |
|------|-------|
| Language | TypeScript strict mode |
| Linting | ESLint (React hooks, refresh rules) |
| No `any` types | — |
| Naming | PascalCase (components), camelCase (functions) |

### Router Configuration

- **Type:** TanStack Router (file-based)
- **Location:** `src/routes/`
- **Type-safe:** Routes are fully typed
- **Loaders:** Fetch data before render via QueryClient

### State Management

| Type | Tool | Location |
|------|------|----------|
| Server state | TanStack Query | `useQuery`, `useMutation` |
| Global/UI state | Zustand | `src/store/*.ts` |
| Local component state | React hooks | `useState`, `useReducer` |

**Critical:** Never store server data in Zustand — use TanStack Query exclusively.

### Data Fetching

- **HTTP Client:** Axios instance in `src/api/client.ts`
- **JWT Interceptor:** Automatically adds `Authorization` header
- **Query Keys:** Constants in `src/api/queryKeys.ts`
- **Mutations:** Invalidate related queries on success

### Styling

- **Framework:** Tailwind CSS v4
- **Config:** CSS-first via `@import "tailwindcss"` in `src/index.css`
- **Components:** shadcn/ui (copy-paste, never modify)
- **Utility:** `cn()` from `src/lib/utils.ts` (clsx + tailwind-merge)
- **Theming:** CSS variables in shadcn/ui — do not override

### Form Handling

- **State:** React Hook Form
- **Validation:** Zod schemas
- **Location:** Schemas in `src/schemas/<domain>.ts`
- **Components:** shadcn/ui `Form` primitives

Example schema:
```typescript
// src/schemas/auth.ts
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})
export type LoginSchema = z.infer<typeof loginSchema>
```

### Import Standards

| Pattern | Allowed | Notes |
|---------|---------|-------|
| `@/components/*` | ✅ | Use `@/` alias (resolves to `src/`) |
| `../../components` | ❌ | Relative imports across boundaries |
| `@/lib/utils` | ✅ | Import utilities with alias |

### Port Mapping

| Service | Port | URL |
|---------|------|-----|
| Vite dev server | 5174 (Docker), 5173 (local) | http://localhost:5174 |
| Backend API | 8004 (Docker), 8000 (local) | http://localhost:8004/api/ |

### File Structure

```
frontend/
├── src/
│   ├── api/
│   │   ├── client.ts       # Axios instance + interceptors
│   │   ├── auth.ts         # Auth API functions
│   │   └── queryKeys.ts    # TanStack Query key constants
│   ├── components/
│   │   ├── ui/             # shadcn/ui components
│   │   └── [feature]/      # Feature-specific components
│   ├── hooks/              # Custom hooks (business logic)
│   ├── lib/
│   │   ├── utils.ts        # cn() helper
│   │   └── date.ts         # date-fns wrappers
│   ├── routes/             # TanStack Router (file-based)
│   │   ├── __root.tsx
│   │   ├── index.tsx
│   │   └── [other routes]
│   ├── schemas/            # Zod validation schemas
│   ├── store/              # Zustand stores (UI, auth state)
│   ├── test/
│   │   └── setup.ts        # Vitest config
│   ├── types/              # API response types
│   └── main.tsx
├── vite.config.ts
├── tsconfig.json
├── eslint.config.js
├── package.json
└── .env.example
```

---

## Docker Compose Configuration

### Services

| Service | Image | Port | Volume |
|---------|-------|------|--------|
| `db` | postgres:16 | 5434:5432 | `postgres_data:/var/lib/postgresql/data` |
| `backend` | ./backend | 8004:8004 | `./backend:/app`, `.venv:/app/.venv` |
| `frontend` | ./frontend | 5174:5174 | `./frontend:/app`, `/app/node_modules` |

### Environment Variables

| Service | Variable | Value |
|---------|----------|-------|
| backend | `DATABASE_URL` | `postgres://appuser:apppassword@db:5432/appdb` |
| backend | `DJANGO_SETTINGS_MODULE` | `core.settings.dev` |
| frontend | `VITE_API_BASE_URL` | `http://localhost:8004` |

### Volumes

- `postgres_data` — Persists database between runs
- `backend_venv` — Caches Python virtual environment

---

## Testing Specifications

### Backend

| Aspect | Standard |
|--------|----------|
| Framework | pytest + pytest-django |
| Command | `just be-test` or `cd backend && uv run pytest` |
| Settings | `DJANGO_SETTINGS_MODULE=core.settings.test` (SQLite) |
| Fixtures | factory-boy + faker in `conftest.py` |
| Time mocking | freezegun |
| Coverage | `just be-test-cov` |

### Frontend

| Aspect | Standard |
|--------|----------|
| Framework | Vitest (Jest-compatible) |
| DOM | jsdom (configured in vite.config.ts) |
| Command | `just fe-test` or `cd frontend && npm test` |
| Mocking | Mock Axios at module level |
| Component tests | Co-located with components (`.test.tsx`) |
| Coverage | `vitest --coverage` |

---

## Environment Variables

### Backend (.env)

```bash
# .env.example
DEBUG=True
SECRET_KEY=change-me-in-production
DATABASE_URL=postgres://appuser:apppassword@localhost:5432/appdb
DJANGO_SETTINGS_MODULE=core.settings.dev
ALLOWED_HOSTS=localhost,127.0.0.1
```

### Frontend (.env)

```bash
# .env.example
VITE_API_BASE_URL=http://localhost:8004
```

---

## Task Runner Commands

### Backend

| Command | Purpose |
|---------|---------|
| `just be-install` | Install dependencies via uv |
| `just be-lint` | Run ruff check |
| `just be-fmt` | Run ruff format |
| `just be-test` | Run full test suite |
| `just be-test-cov` | Run tests with coverage |
| `just be-migrate` | Apply migrations |
| `just be-makemigrations` | Create migrations |
| `just be-type-check` | Run mypy |

### Frontend

| Command | Purpose |
|---------|---------|
| `just fe-install` | Install dependencies via npm |
| `just fe-lint` | Run ESLint |
| `just fe-build` | Build for production |
| `just fe-test` | Run test suite |
| `just fe-test-ui` | Run Vitest UI |
| `just fe-dev` | Start Vite dev server |

---

## Architecture Principles

### Separation of Concerns

1. **Views/Handlers** — HTTP layer only, delegate to services
2. **Services** — Business logic, testable in isolation
3. **Models** — Data layer, no business rules
4. **Serializers** — Request/response validation, no logic

### Backend Rules

- All models use UUIDs as primary keys
- Use `select_related()` and `prefetch_related()` to prevent N+1
- Use `bulk_create()` / `bulk_update()` for batch operations
- Environment config via `django-environ`, never hardcode
- `AUTH_USER_MODEL = "accounts.CustomUser"` throughout

### Frontend Rules

- Functional components only, no class components
- No business logic in components — extract to hooks
- Co-locate tests with components
- Use `@/` alias for all internal imports
- Never use relative imports across feature boundaries

---

## Git & CI/CD

### Commit Standards

- Follow conventional commits: `type(scope): subject`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- Examples: `feat(auth): add JWT refresh logic`, `fix(ui): button padding`

### Branches

- `main` — Production-ready code
- `develop` — Staging/integration branch
- `feature/*` — Feature branches
- `bugfix/*` — Bug fix branches

---

## Deployment

### Docker Build

- Backend: Multi-stage Dockerfile, optimized for production
- Frontend: Built with `npm run build`, served via nginx/gunicorn

### Production Checklist

- [ ] `DEBUG=False`
- [ ] `SECRET_KEY` set securely (random, >50 chars)
- [ ] `ALLOWED_HOSTS` configured for your domain
- [ ] Database migrations applied
- [ ] Static files collected (frontend built)
- [ ] SSL/TLS certificate obtained (https://)
- [ ] CORS configured for frontend origin

---

## References

- **Backend:** `backend/pyproject.toml` for all dependencies
- **Frontend:** `frontend/package.json` for all dependencies
- **Docker:** `docker-compose.yml` for service configuration
- **Guides:** `docs/guides/` for setup and workflows
- **API Contracts:** `docs/standards/api-contracts.md` for endpoint specs
- **Code Style:** `AGENTS.md` for coding conventions
