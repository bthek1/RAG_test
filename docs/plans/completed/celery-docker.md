# Plan: Celery + Redis via Docker

**Status:** Complete
**Date:** 2026-03-17

---

## Goal

Add Celery (with Redis as the message broker) to the backend to support async/background task processing — primarily for long-running operations like document ingestion and embedding generation. Celery and Redis run as Docker services; the Celery worker is also integrated into `just dev` for local development.

## Background

The RAG pipeline currently performs document parsing, chunking, and embedding synchronously inside Django request/response cycles. This blocks HTTP responses for potentially seconds or minutes (depending on document size and model inference). Offloading these operations to Celery tasks will allow the API to return immediately and process documents in the background.

Redis is used as the Celery message broker and result backend — it is lightweight, fast, and runs well in Docker.

---

## Phases

### Phase 1 — Dependencies & App Configuration

- [x] Add `celery[redis]` and `redis` to `pyproject.toml` dependencies
- [x] Create `backend/celery.py` — Celery application instance wired to Django settings
- [x] Update `backend/core/__init__.py` to expose `celery_app` so Django's app registry auto-discovers tasks
- [x] Add Celery settings block to `backend/core/settings/base.py`:
  - `CELERY_BROKER_URL` (from env, defaults to `redis://localhost:6379/0`)
  - `CELERY_RESULT_BACKEND`
  - `CELERY_ACCEPT_CONTENT`, `CELERY_TASK_SERIALIZER`, `CELERY_RESULT_SERIALIZER`
  - `CELERY_TIMEZONE`

### Phase 2 — Docker Infrastructure

- [x] Add `redis` service to `docker-compose.yml` (`redis:7-alpine`, port `6379`)
- [x] Add `celery_worker` service to `docker-compose.yml`:
  - Uses same `./backend` build context as the backend service
  - Command: `uv run celery -A core worker --loglevel=info --concurrency=2`
  - Depends on `db` and `redis`
  - Mounts the same `backend_venv` volume so it shares the installed packages
  - Receives `CELERY_BROKER_URL` and `CELERY_RESULT_BACKEND` env vars pointing at the `redis` container

### Phase 3 — Justfile Integration

- [x] Extend `db-up` to also start the `redis` Docker service when not already running
- [x] Add `be-celery` recipe — runs Celery worker locally (for dev, expects Redis at `localhost:6379`)
- [x] Update `dev` recipe — adds `just be-celery` as a third concurrent process alongside `be-dev` and `fe-dev`
- [x] Add `celery-up` recipe — starts only the Celery worker container via Docker Compose (useful when running the Django server locally but want the worker in Docker)
- [x] Add `be-celery-purge` recipe — purges all queued tasks (handy when testing)

### Phase 4 — Background Tasks (follow-on)

- [x] Create `apps/embeddings/tasks.py` with `@shared_task` definitions for:
  - `ingest_document(document_id: str)` — chunking + embedding pipeline
  - `reembed_document(document_id: str)` — re-embed with a new model
- [x] Create `apps/embeddings/tests/test_tasks.py` — unit + integration tests for both tasks
- [x] Update embedding views to enqueue tasks instead of running inline
- [x] Add task status field to `Document` model (`pending | processing | done | failed`)
- [x] Expose task status via a dedicated API endpoint (`GET /api/embeddings/documents/{id}/status/`)

---

## Testing

**Unit tests:**
- Mock `task.delay()` / `task.apply_async()` in view tests — never trigger real Celery in unit tests
- Test task logic directly by calling the underlying service functions (they are already tested via `services.py`)

**Integration tests:**
- Use `CELERY_TASK_ALWAYS_EAGER = True` in `core/settings/test.py` so tasks run synchronously during the test suite without needing a live broker

**Manual verification:**
1. `just dev` — confirm three processes start: Django, Vite, Celery worker
2. `just up` — confirm four containers start: db, redis, backend, celery_worker
3. `docker compose logs celery_worker` — verify worker connects to Redis and reports `[celery@... ready]`
4. From Django shell: `from apps.embeddings.tasks import ingest_document; ingest_document.delay("<id>")` — verify task appears in worker logs

---

## Risks & Notes

- **Concurrency:** Default `--concurrency=2` in Docker. Sentence-transformers loads a model per worker process — higher concurrency increases memory usage significantly. Tune to available RAM.
- **Task idempotency:** Tasks that call the embedding service must be idempotent (safe to retry). The `Document` status field (Phase 4) enables this.
- **Env vars in dev:** `CELERY_BROKER_URL` is not required in `.env` for local dev — the settings default (`redis://localhost:6379/0`) is used when running the worker locally via `just be-celery`.
- **`.env.example`:** Add `CELERY_BROKER_URL` and `CELERY_RESULT_BACKEND` entries (commented out, showing the defaults) so new developers know they exist.
