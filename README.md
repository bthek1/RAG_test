# django_react_template

A monorepo starter for a decoupled web application:

- **`backend/`** — Django REST Framework API (Python 3.13, PostgreSQL)
- **`frontend/`** — React 18 SPA (TypeScript, Vite, TanStack Router, TanStack Query)

---

## Quick Start

```bash
# 1. Clone
git clone <repo-url> && cd django_react_template

# 2. Create env files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Start everything
docker compose up

# 4. Run migrations (first time)
docker compose exec backend python manage.py migrate
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5174 |
| Backend API | http://localhost:8004/api/ |
| Django admin | http://localhost:8004/admin/ |
| Health check | http://localhost:8004/api/health/ |

---

## Documentation

| Doc | Description |
|-----|-------------|
| [📖 Docs Index](docs/README.md) | Navigation guide for all documentation |
| [🚀 Local Setup](docs/guides/local-setup.md) | Dev environment setup (Docker or local) |
| [👋 Onboarding](docs/guides/onboarding.md) | New developer orientation |
| [🏗️ Architecture](docs/explanations/architecture.md) | System design, structure, data flow |
| [📊 Project Specs](docs/standards/project-specs.md) | All tech versions, standards, configs |
| [🔌 API Contracts](docs/standards/api-contracts.md) | All endpoints, request/response shapes |
| [🔐 Auth Flow](docs/explanations/auth-flow.md) | JWT authentication end-to-end |
| [📝 Conventions](AGENTS.md) | Coding standards for backend & frontend |

---

## Project Structure

```
/
├── backend/          Django REST API
│   ├── core/         Settings, URLs, WSGI
│   ├── apps/         Domain applications
│   │   ├── accounts/ User model (email-based), registration, JWT auth
│   │   └── pages/    Health check
│   └── manage.py
├── frontend/         React SPA
│   └── src/
│       ├── api/      Axios client, query keys, API functions
│       ├── components/ui/  shadcn/ui components
│       ├── hooks/    Custom hooks (auth, etc.)
│       ├── lib/      cn() helper, date-fns wrappers
│       ├── routes/   TanStack Router file-based routes
│       ├── schemas/  Zod validation schemas
│       ├── store/    Zustand global state slices
│       └── types/    TypeScript types from API contracts
├── docs/             Project knowledge base
└── docker-compose.yml
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend language | Python | 3.13 |
| Backend framework | Django + DRF | 5.1+ |
| Auth | JWT | djangorestframework-simplejwt 5.3 |
| Database | PostgreSQL | 16 |
| DB Driver | psycopg | 3.2+ |
| Dependency manager | [uv](https://github.com/astral-sh/uv) | latest |
| Code quality | Ruff | 0.9+ |
| Type checking | mypy | 1.13+ |
| Frontend language | TypeScript | 5.6+ |
| Frontend bundler | Vite | 5.4+ |
| UI framework | React | 18.3+ |
| Routing | TanStack Router | 1.166+ |
| Server state | TanStack Query | 5.90+ |
| HTTP client | Axios | 1.13+ |
| Styling | Tailwind CSS | 4.2+ |
| UI Components | shadcn/ui | latest |
| Forms | React Hook Form + Zod | 7.71+, 4.3+ |
| Global state | Zustand | 5.0+ |
| Testing (backend) | pytest + pytest-django | 8.0+, 4.9+ |
| Testing (frontend) | Vitest + React Testing Library | 2.1+, 16.3+ |
| Utilities | date-fns, Plotly.js | 4.1+, 3.4+ |
| Container | Docker Compose | - |
| Task runner | [just](https://github.com/casey/just) | latest |
