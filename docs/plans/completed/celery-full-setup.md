# Plan: Celery Full Setup (celery_setup.md Implementation)

**Status:** Complete
**Date:** 2026-03-18

---

## Goal

Implement the remaining items from `docs/standards/celery_setup.md` that are not yet covered by the completed `celery-docker.md` plan. This adds DB-backed results (`django-celery-results`), periodic task scheduling (`django-celery-beat`), extended reliability settings, a Celery Beat Docker service, task status/revoke DRF endpoints, a React polling hook + component, Flower monitoring, and a comprehensive `pytest-celery` test suite.

## Background

The `celery-docker.md` plan is complete: Redis broker, Celery worker (Docker + local), basic `CELERY_BROKER_URL`/`CELERY_RESULT_BACKEND`/`CELERY_ACCEPT_CONTENT` settings, and `ingest_document` / `reembed_document` tasks all exist. However:

- Results are stored in Redis (ephemeral), not in Postgres (queryable, persistent via ORM)
- No periodic task support (`django-celery-beat`) or Beat Docker service
- Extended reliability settings (`ACKS_LATE`, `PREFETCH_MULTIPLIER`, time limits, `TRACK_STARTED`) are absent
- No DRF endpoints for polling task state or revoking tasks
- No frontend polling hook or task trigger component
- Flower monitoring is undocumented and not wired up
- Test suite uses only eager mode — no `pytest-celery` worker or mock patterns

---

## Current State (already done)

| Item | Status |
|---|---|
| `celery[redis]` dependency | ✅ Done |
| `backend/core/celery.py` | ✅ Done |
| Basic `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`, serializer settings | ✅ Done |
| `redis` + `celery_worker` Docker services | ✅ Done |
| `be-celery`, `be-celery-purge`, `celery-up` justfile recipes | ✅ Done |
| `ingest_document` + `reembed_document` tasks | ✅ Done |
| Task tests (eager mode only) | ✅ Done |

---

## Phases

### Phase 1 — DB-backed Results (`django-celery-results`)

- [ ] Add `django-celery-results` to `pyproject.toml` dependencies:
  ```
  uv add django-celery-results
  ```
- [ ] Add `"django_celery_results"` to `INSTALLED_APPS` in `base.py`
- [ ] Switch `CELERY_RESULT_BACKEND` from `"redis://..."` to `"django-db"` in `base.py`
- [ ] Add `CELERY_RESULT_EXTENDED = True` to `base.py`
- [ ] Update `celery_worker` service in `docker-compose.yml`: remove `CELERY_RESULT_BACKEND` env override (worker will use `django-db` via Django settings)
- [ ] Run `uv run python manage.py migrate` to create `django_celery_results_taskresult` table
- [ ] Update `.env.example`: remove `CELERY_RESULT_BACKEND` entry (no longer relevant as a URL)

### Phase 2 — Periodic Task Scheduling (`django-celery-beat`)

- [ ] Add `django-celery-beat` to `pyproject.toml` dependencies:
  ```
  uv add django-celery-beat
  ```
- [ ] Add `"django_celery_beat"` to `INSTALLED_APPS` in `base.py`
- [ ] Add `CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"` to `base.py`
- [ ] Run `uv run python manage.py migrate` to create Beat tables
- [ ] Add `celery_beat` service to `docker-compose.yml`:
  ```yaml
  celery_beat:
    build: ./backend
    command: uv run celery -A core beat --loglevel=info --scheduler django_celery_beat.schedulers:DatabaseScheduler
    volumes:
      - ./backend:/app
      - backend_venv:/app/.venv
    depends_on:
      - db
      - redis
    env_file:
      - path: ./backend/.env
        required: false
    environment:
      DATABASE_URL: postgres://appuser:apppassword@db:5432/appdb
      CELERY_BROKER_URL: redis://redis:6379/0
  ```
- [ ] Add `be-beat` justfile recipe — runs Beat locally:
  ```just
  be-beat:
      cd backend && uv run celery -A core beat --loglevel=info --scheduler django_celery_beat.schedulers:DatabaseScheduler
  ```
- [ ] Add `beat-up` justfile recipe:
  ```just
  beat-up:
      docker compose up -d celery_beat
  ```

### Phase 3 — Extended Reliability & Tracking Settings

Add the following to the `# ── Celery` block in `backend/core/settings/base.py`:

- [ ] `CELERY_TASK_TRACK_STARTED = True` — exposes STARTED state (UI can show "in progress" vs "queued")
- [ ] `CELERY_TASK_SEND_SENT_EVENT = True` — emits `task-sent` events for Flower
- [ ] `CELERY_WORKER_SEND_TASK_EVENTS = True` — enables task event stream for monitoring
- [ ] `CELERY_TASK_ACKS_LATE = True` — task survives worker crash; requeued automatically
- [ ] `CELERY_WORKER_PREFETCH_MULTIPLIER = 1` — long tasks don't block short ones on the same worker
- [ ] `CELERY_TASK_SOFT_TIME_LIMIT = 300` — raises `SoftTimeLimitExceeded` after 5 min
- [ ] `CELERY_TASK_TIME_LIMIT = 360` — hard kill after 6 min

### Phase 4 — Task Status/Revoke DRF Endpoints

Add task management endpoints to `apps/embeddings/`:

- [ ] Add the following views to `apps/embeddings/views.py`:
  - `task_status(request, task_id)` — `GET /api/embeddings/tasks/<task_id>/` — returns `{task_id, status, result, traceback}`
  - `revoke_task(request, task_id)` — `POST /api/embeddings/tasks/<task_id>/revoke/` — calls `AsyncResult(task_id).revoke(terminate=True)`
- [ ] Wire up new URL patterns in `apps/embeddings/urls.py`
- [ ] Add `IsAuthenticated` permission to both views
- [ ] Update `docs/standards/api-contracts.md` with the new endpoints

### Phase 5 — Frontend Task Polling Hook + Component

- [ ] Create `frontend/src/hooks/useTaskPoller.ts`:
  - `useTaskPoller<T>(taskId: string | null, intervalMs?: number): TaskResult<T> | null`
  - Polls `GET /api/embeddings/tasks/<taskId>/` every `intervalMs` ms (default 2000)
  - Stops polling automatically on `SUCCESS`, `FAILURE`, or `REVOKED`
  - Cleans up the interval on unmount
  - Uses the `@/api/client` Axios instance (JWT auth), not raw `fetch`
- [ ] Add `TaskStatus` and `TaskResult` TypeScript types to `frontend/src/types/tasks.ts`
- [ ] Add query key `queryKeys.tasks.detail(id)` to `frontend/src/api/queryKeys.ts`
- [ ] Create `frontend/src/components/TaskStatusBadge.tsx`:
  - Renders a status badge (`PENDING`, `STARTED`, `SUCCESS`, `FAILURE`, `REVOKED`) with appropriate colour
  - Uses `cn()` + Tailwind CSS for styling
  - Uses shadcn/ui `Badge` component
- [ ] Write `frontend/src/hooks/useTaskPoller.test.ts` — unit tests covering:
  - Starts polling when `taskId` is set
  - Stops polling on terminal status
  - Cleans up interval on unmount
- [ ] Write `frontend/src/components/TaskStatusBadge.test.tsx`

### Phase 6 — Flower Monitoring

- [ ] Add `flower` to `pyproject.toml` dev dependencies:
  ```
  uv add --dev flower
  ```
- [ ] Add `flower` service to `docker-compose.yml`:
  ```yaml
  flower:
    build: ./backend
    command: uv run celery -A core flower --port=5555
    ports:
      - "5555:5555"
    depends_on:
      - redis
    environment:
      CELERY_BROKER_URL: redis://redis:6379/0
  ```
- [ ] Add `be-flower` justfile recipe — runs Flower locally:
  ```just
  be-flower:
      cd backend && uv run celery -A core flower --port=5555
  ```
- [ ] Add `flower-up` justfile recipe:
  ```just
  flower-up:
      docker compose up -d flower
  ```
- [ ] Document Flower URL (`http://localhost:5555`) in `docs/guides/local-setup.md`

### Phase 7 — Enhanced pytest-celery Test Suite

- [ ] Add `pytest-celery` to `pyproject.toml` dev dependencies:
  ```
  uv add --dev pytest-celery
  ```
- [ ] Add `celery_config` fixture to `backend/conftest.py` (or `apps/embeddings/tests/conftest.py`) returning in-memory broker/backend config
- [ ] Add `eager_celery` shared fixture to `apps/embeddings/tests/conftest.py`
- [ ] Extend `apps/embeddings/tests/test_tasks.py` with:
  - **Mode 2 tests** (`@pytest.mark.celery` + `celery_worker` fixture) for async state transitions and retry behaviour — marked `@pytest.mark.integration`
  - **Mock tests** verifying `.delay()` is called with correct args when a view dispatches a task (complement `test_views.py`)
- [ ] Add `apps/embeddings/tests/test_beat.py`:
  - Test that periodic tasks can be registered via `PeriodicTask` model
  - Marked `@pytest.mark.django_db`
- [ ] Verify `CELERY_TASK_ALWAYS_EAGER = True` is set in `core/settings/test.py` (already done per `celery-docker.md` plan — confirm and add `CELERY_TASK_EAGER_PROPAGATES = True` if missing)

---

## Testing

**Unit tests (no broker needed):**
- All task logic tested with `CELERY_TASK_ALWAYS_EAGER = True` (eager mode, existing pattern)
- New view tests for `task_status` and `revoke_task` — mock `AsyncResult` at module level
- `useTaskPoller` hook tests with mocked Axios + fake timers (Vitest `vi.useFakeTimers()`)
- `TaskStatusBadge` component tests with React Testing Library

**Integration tests (PostgreSQL + in-memory broker):**
- `pytest-celery` worker tests for retry behaviour and async state transitions (marked `integration`)
- Beat schedule registration tests using `PeriodicTask` / `IntervalSchedule` models

**Manual verification:**
1. `just up` — confirm five containers start: `db`, `redis`, `backend`, `celery_worker`, `celery_beat`
2. `docker compose logs celery_worker` — worker shows `[celery@... ready]`
3. `docker compose logs celery_beat` — beat shows `Scheduler: Sending due task...` (once a schedule is registered)
4. Django Admin → `/admin/django_celery_results/taskresult/` — task results visible after dispatching a task
5. Django Admin → `/admin/django_celery_beat/periodictask/` — periodic tasks manageable in UI
6. `just up flower-up` then `http://localhost:5555` — Flower dashboard shows connected workers
7. `GET /api/embeddings/tasks/<task_id>/` returns `{task_id, status, result}` after dispatching a document ingestion task

---

## Risks & Notes

- **Result backend migration:** Switching `CELERY_RESULT_BACKEND` from Redis to `django-db` means existing task IDs stored in Redis will no longer be queryable. This is acceptable since no production data depends on it.
- **`celery_worker` env var cleanup:** The `CELERY_RESULT_BACKEND` env override in `docker-compose.yml` must be removed to avoid conflicting with the `django-db` backend set via Django settings.
- **Beat singleton:** Only one Beat process should ever run at a time (double-running Beat causes duplicate task firing). The Docker service handles this naturally; local dev should use `just be-beat` only when not running `just up`.
- **Memory usage:** Adding `celery_beat` and `flower` containers increases Docker RAM usage. Flower is optional for local dev — add it to a separate `docker-compose.monitoring.yml` if resource-constrained.
- **`pytest-celery` compatibility:** Verify version compatibility with existing `celery[redis]>=5.4` before adding the dev dependency.
- **`useTaskPoller` vs TanStack Query:** The polling hook is intentionally a standalone `useEffect`-based hook (not `useQuery`) because task polling is fire-and-forget with self-terminating logic. If refactoring to TanStack Query's `refetchInterval` pattern is preferred, note it in the component.
