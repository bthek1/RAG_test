# Django + React Monorepo — Justfile
# Run `just` or `just --list` to see all available commands.

set dotenv-load := false

# Clear any shell-activated virtualenv so uv uses the project's own .venv
# (avoids "VIRTUAL_ENV does not match project environment path" warning)

export VIRTUAL_ENV := ""

# ── Default ────────────────────────────────────────────────────────────────────

# Show available commands
default:
    @just --list

# ── Docker ─────────────────────────────────────────────────────────────────────

# Start all services (db, backend, frontend)
up:
    docker compose up

# Start all services in the background
up-d:
    docker compose up -d

# Stop all services
down:
    docker compose down

# Stop all services and remove volumes
down-v:
    docker compose down -v

# Rebuild all images
build:
    docker compose build

# Rebuild a specific service: just build-svc backend
build-svc svc:
    docker compose build {{ svc }}

# Tail logs for all services
logs:
    docker compose logs -f

# Tail logs for a specific service: just logs-svc backend
logs-svc svc:
    docker compose logs -f {{ svc }}

# ── Backend ────────────────────────────────────────────────────────────────────

# Install backend dependencies (uv)
be-install:
    cd backend && uv sync --group dev

# Run the Django dev server locally
be-dev: be-makemigrations be-migrate
    cd backend && uv run python manage.py runserver 0.0.0.0:8004

# Apply database migrations
be-migrate:
    cd backend && uv run python manage.py migrate

# Create new migrations after model changes
be-makemigrations app="":
    cd backend && uv run python manage.py makemigrations {{ app }}

# Show pending migrations
be-showmigrations:
    cd backend && uv run python manage.py showmigrations

# Open the Django shell
be-shell:
    cd backend && uv run python manage.py shell

# Create a Django superuser
be-superuser:
    cd backend && uv run python manage.py createsuperuser --noinput

# Collect static files
be-collectstatic:
    cd backend && uv run python manage.py collectstatic --noinput

# Run backend test suite
be-test:
    cd backend && uv run pytest

# Run backend tests with coverage
be-test-cov:
    cd backend && uv run pytest --cov=apps --cov-report=term-missing

# Lint backend code (ruff, if available)
be-lint:
    cd backend && uv run ruff check .

# Format backend code (ruff, if available)
be-fmt:
    cd backend && uv run ruff format .

# Run the Celery worker locally (expects Redis at localhost:6379)
be-celery:
    cd backend && uv run celery -A core worker --loglevel=info

# Purge all queued Celery tasks
be-celery-purge:
    cd backend && uv run celery -A core purge -f

# Run the Celery Beat scheduler locally (expects Redis + PostgreSQL)
be-beat:
    cd backend && uv run celery -A core beat --loglevel=info --scheduler django_celery_beat.schedulers:DatabaseScheduler

# Run Flower monitoring dashboard locally (port 5555)
be-flower:
    cd backend && uv run celery -A core flower --port=5555

# Start the Celery worker container via Docker Compose
celery-up:
    docker compose up -d celery_worker

# Start the Celery Beat container via Docker Compose
beat-up:
    docker compose up -d celery_beat

# Start the Flower monitoring container via Docker Compose
flower-up:
    docker compose up -d flower

# ── Frontend ───────────────────────────────────────────────────────────────────

# Install frontend dependencies
fe-install:
    cd frontend && npm install

# Run the Vite dev server locally
fe-dev:
    cd frontend && npm run dev -- --host 0.0.0.0 --port 5174

# Build the frontend for production
fe-build:
    cd frontend && npm run build

# Preview the production build
fe-preview:
    cd frontend && npm run preview

# Lint frontend code
fe-lint:
    cd frontend && npm run lint

# Run frontend tests
fe-test:
    cd frontend && npm test

# Run frontend tests in watch mode with Vitest UI
fe-test-ui:
    cd frontend && npm run test:ui

# ── Dev ────────────────────────────────────────────────────────────────────────

# Install all dependencies (backend + frontend)
install: be-install fe-install

# Start the db and redis containers if not already running
db-up:
    @docker compose ps --status running db | grep -q db \
        && echo "DB already running." \
        || (echo "Starting DB..." && docker compose up -d db && echo "Waiting for DB to be ready..." && sleep 3)
    @docker compose ps --status running redis | grep -q redis \
        && echo "Redis already running." \
        || (echo "Starting Redis..." && docker compose up -d redis)

# Run backend and frontend dev servers concurrently (uses overmind if available)
dev: db-up
    #!/usr/bin/env bash
    echo "Starting backend, frontend, and Celery dev servers..."
    echo "  Backend : http://localhost:8004"
    echo "  Frontend: http://localhost:5174"
    echo "  Celery  : worker (broker: redis://localhost:6379/0)"
    _pids=()
    _cleanup() {
        echo ""
        for pid in "${_pids[@]}"; do kill "$pid" 2>/dev/null || true; done
        wait 2>/dev/null || true
    }
    trap _cleanup INT TERM EXIT
    if command -v overmind &>/dev/null; then
        overmind start
    else
        just be-dev &
        _pids+=($!)
        just fe-dev &
        _pids+=($!)
        just be-celery &
        _pids+=($!)
        wait "${_pids[@]}"
    fi

# ── Database ───────────────────────────────────────────────────────────────────

# Open a psql session via Docker
db-shell:
    docker compose exec db psql -U appuser -d appdb

# Reset the database (drops volumes and re-applies migrations)
db-reset: down-v up-d be-migrate
    @echo "Database reset complete."

# ── Utilities ──────────────────────────────────────────────────────────────────

# Print configured environment files
env:
    @echo "=== backend/.env ===" && cat backend/.env 2>/dev/null || echo "(not found)"
    @echo "=== frontend/.env ===" && cat frontend/.env 2>/dev/null || echo "(not found)"

# Copy .env.example files to .env (safe — skips if already exists)
env-init:
    @[ -f backend/.env ] || cp backend/.env.example backend/.env && echo "Created backend/.env"
    @[ -f frontend/.env ] || cp frontend/.env.example frontend/.env && echo "Created frontend/.env"

# Clean Python bytecode and cache files
clean:
    find backend -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
    find backend -name "*.pyc" -delete 2>/dev/null || true

# Clean everything including node_modules and build artefacts
clean-all: clean
    rm -rf frontend/node_modules frontend/dist
