# Documentation Index

Welcome to the project documentation. This guide helps you navigate all available resources.

---

## Quick Links

### Getting Started

- **[Local Setup Guide](guides/local-setup.md)** — How to run the project locally (Docker or without Docker)
- **[Onboarding](guides/onboarding.md)** — New developer orientation

### Architecture & Design

- **[Architecture](explanations/architecture.md)** — System design, structure, data flow
- **[Project Specifications](standards/project-specs.md)** — Complete tech stack, versions, standards
- **[Authentication Flow](explanations/auth-flow.md)** — JWT authentication end-to-end

### API & Integration

- **[API Contracts](standards/api-contracts.md)** — All endpoints, request/response shapes, status codes

### Development

- **[Coding Conventions](../AGENTS.md)** — Code style, naming, patterns (backend & frontend)

---

## By Role

### Backend Developer

1. Read **[Onboarding](guides/onboarding.md)** for project overview
2. Review **[Project Specifications](standards/project-specs.md)** for backend stack
3. Check **[API Contracts](standards/api-contracts.md)** for endpoint specs
4. Reference **[Coding Conventions](../AGENTS.md)** for backend code style
5. Follow **[Local Setup Guide](guides/local-setup.md)** to get running

### Frontend Developer

1. Read **[Onboarding](guides/onboarding.md)** for project overview
2. Review **[Project Specifications](standards/project-specs.md)** for frontend stack
3. Check **[API Contracts](standards/api-contracts.md)** for available endpoints
4. Reference **[Coding Conventions](../AGENTS.md)** for frontend code style
5. Follow **[Local Setup Guide](guides/local-setup.md)** to get running

### DevOps/Infrastructure

1. Review **[Project Specifications](standards/project-specs.md)** for all services & ports
2. Check **[Docker Setup](guides/local-setup.md#option-a--full-stack-with-docker-compose-recommended)** for container config
3. Reference `docker-compose.yml` in the root directory

---

## Documentation Structure

```
docs/
├── README.md                              # This file
├── guides/
│   ├── local-setup.md                    # Dev environment setup
│   └── onboarding.md                     # New developer intro
├── explanations/
│   ├── architecture.md                   # System design & structure
│   └── auth-flow.md                      # JWT authentication flow
├── standards/
│   ├── project-specs.md                  # All tech specs & versions
│   └── api-contracts.md                  # API endpoints & shapes
└── plans/
    └── [historical feature plans]        # Past implementation docs
```

---

## Checklists

### Before Your First Commit

- [ ] Read [Coding Conventions](../AGENTS.md) for your layer (backend or frontend)
- [ ] Run linter: `just be-lint` (backend) or `just fe-lint` (frontend)
- [ ] Run tests: `just be-test` (backend) or `just fe-test` (frontend)
- [ ] Type-check: `cd backend && uv run mypy .` (backend) or type checking via build (frontend)

### Before Pushing

- [ ] All tests pass locally
- [ ] Linter is clean
- [ ] Code follows conventions from [AGENTS.md](../AGENTS.md)
- [ ] Commit message follows conventional commits: `type(scope): subject`

### Before Deploying

- [ ] All tests pass in CI
- [ ] Code review approved
- [ ] Security secrets checked (never commit `.env`)
- [ ] Database migrations tested
- [ ] Production environment variables verified

---

## Key Statistics

| Layer | Tech | Version |
|-------|------|---------|
| **Backend** | Python | 3.13 |
| — | Django | 5.1+ |
| — | PostgreSQL | 16 |
| **Frontend** | TypeScript | 5.6+ |
| — | React | 18.3+ |
| — | Vite | 5.4+ |
| **Testing** | pytest (backend) | 8.0+ |
| — | Vitest (frontend) | 2.1+ |

---

## Helpful Commands

### Backend

```bash
# Setup
just be-install          # Install dependencies
just be-migrate          # Run migrations

# Development
just be-lint             # Check code style
just be-fmt              # Auto-format code
just be-test             # Run tests
just be-type-check       # Type checking

# Specific test
cd backend && uv run pytest apps/accounts/tests/test_models.py::TestUser::test_email
```

### Frontend

```bash
# Setup
just fe-install          # Install dependencies

# Development
just fe-dev              # Start dev server
just fe-lint             # Check code style
just fe-build            # Type-check & build
just fe-test             # Run tests
just fe-test-ui          # Vitest UI

# Specific test
cd frontend && npm test -- src/components/Button.test.tsx -t "renders"
```

### Docker

```bash
# Full stack
docker compose up        # Start all services
docker compose down      # Stop all services

# Specific service
docker compose logs -f backend
docker compose exec backend python manage.py migrate
```

---

## FAQ

**Q: How do I change the API base URL?**  
A: In `frontend/.env`, update `VITE_API_BASE_URL`. See [Local Setup](guides/local-setup.md).

**Q: How do I add a new API endpoint?**  
A: Create a new view in `backend/apps/<domain>/views.py`, serializer in `serializers.py`, and service in `services.py`. Document it in [API Contracts](standards/api-contracts.md). See [Coding Conventions](../AGENTS.md) for patterns.

**Q: How do I add a new page to the frontend?**  
A: Create a new `.tsx` file in `frontend/src/routes/`. TanStack Router auto-discovers routes. See [Architecture](explanations/architecture.md).

**Q: How do I create a database migration?**  
A: Modify `backend/apps/<app>/models.py`, then run `just be-makemigrations <app>` and `just be-migrate`.

**Q: How do I run a specific test?**  
A: Backend: `cd backend && uv run pytest <path>::<TestClass>::<test_method>`  
Frontend: `cd frontend && npm test -- <path> -t "<test_name>"`

**Q: Where's the project spec for [technology]?**  
A: Check [Project Specifications](standards/project-specs.md) for all versions and configurations.

---

## Reference

- **Git:** Conventional commits (see [Coding Conventions](../AGENTS.md))
- **Python:** Black-compatible, 88-char lines, double quotes (ruff)
- **TypeScript:** Strict mode, no `any` types
- **Naming:** PascalCase for classes/components, camelCase for functions
- **Env vars:** Never commit `.env` files — use `.env.example`

---

## Getting Help

1. Check the relevant guide (setup, architecture, API contracts)
2. Search the documentation with your question
3. Review [Coding Conventions](../AGENTS.md) for code patterns
4. Refer to [Project Specifications](standards/project-specs.md) for tech versions

Still stuck? Ask the team or file an issue on GitHub.
