# Plan: Deprecate and Remove the `pages` App

**Status:** Complete
**Date:** 2026-04-15

---

## Goal

Remove the `apps/pages` Django app entirely. It has no models, no migrations, and only two responsibilities — a health-check endpoint and a GPU-status endpoint — which belong in `core/` and `apps/embeddings/` respectively. Consolidating these reduces unnecessary app surface area and makes ownership clearer.

## Background

The `pages` app exists as a catch-all that was used during early development. It currently contains:

| File | Contents |
|---|---|
| `models.py` | Empty |
| `admin.py` | Empty |
| `migrations/` | Only `__init__.py` (no schema) |
| `services.py` | `get_gpu_status()` — queries torch for CUDA/MPS/CPU info |
| `views.py` | `health_check`, `gpu_status` — two `@api_view` function-based views |
| `urls.py` | `GET /api/health/`, `GET /api/gpu-status/` |
| `tests.py` | 8 test cases covering both views and `get_gpu_status()` |

Because the app has no database footprint (no models, no migrations with schema changes), removal requires no data migration.

---

## Destination Mapping

| Artefact | Current location | Move to |
|---|---|---|
| `health_check` view | `apps/pages/views.py` | `core/views.py` (new file) |
| `gpu_status` view | `apps/pages/views.py` | `apps/embeddings/views.py` |
| `get_gpu_status()` service | `apps/pages/services.py` | `apps/embeddings/services.py` |
| `GET /api/health/` URL | `apps/pages/urls.py` → `core/urls.py` include | Register directly in `core/urls.py` |
| `GET /api/gpu-status/` URL | `apps/pages/urls.py` | `apps/embeddings/urls.py` |
| Tests — `TestHealthCheck` | `apps/pages/tests.py` | `core/tests/test_views.py` (new) |
| Tests — `TestGetGpuStatus` + GPU view | `apps/pages/tests.py` | `apps/embeddings/tests/test_gpu.py` (new) |

---

## Phases

### Phase 1 — Move `get_gpu_status()` to `apps/embeddings/services.py`

- [x] Append `get_gpu_status()` function to the bottom of `apps/embeddings/services.py`
- [x] Confirm no name collision with existing symbols in that file

### Phase 2 — Move `gpu_status` view to `apps/embeddings/views.py`

- [x] Add `gpu_status` view to `apps/embeddings/views.py`, importing from the local `services.py`
- [x] Add `path("gpu-status/", gpu_status, name="gpu-status")` to `apps/embeddings/urls.py`
- [x] New URL: `GET /api/embeddings/gpu-status/`

> **Note:** The public URL path changes from `/api/gpu-status/` to `/api/embeddings/gpu-status/`. Update the frontend (`src/api/`) and `docs/standards/api-contracts.md` accordingly.

### Phase 3 — Move `health_check` view to `core/`

- [x] Create `core/views.py` with the `health_check` view
- [x] Register it directly in `core/urls.py`: `path("api/health/", health_check, name="health-check")`
- [x] Remove the `include("apps.pages.urls")` line from `core/urls.py`

> The URL path stays the same: `GET /api/health/`.

### Phase 4 — Migrate tests

- [x] Create `core/tests/` directory with `__init__.py`
- [x] Create `core/tests/test_views.py` with `TestHealthCheck` class (copied from `apps/pages/tests.py`)
- [x] Create `apps/embeddings/tests/test_gpu.py` with `TestGetGpuStatus` and `TestGpuStatusView` classes

### Phase 5 — Remove the `pages` app

- [x] Delete `apps/pages/` directory entirely
- [x] Remove `"apps.pages"` from `INSTALLED_APPS` in `core/settings/base.py`
- [x] Confirm `core/urls.py` no longer references `apps.pages`
- [x] Run `uv run pytest` to confirm no test failures
- [x] Run `uv run ruff check .` and `uv run mypy .`

### Phase 6 — Update docs and API contracts

- [x] Update `docs/standards/api-contracts.md`: change `/api/gpu-status/` → `/api/embeddings/gpu-status/`
- [x] Update any frontend API call pointing to the old GPU status URL (`src/api/health.ts`)
- [x] Mark this plan as **Complete**

---

## Testing

**Unit tests:**
- `TestGetGpuStatus` — pure unit tests for `get_gpu_status()`, no DB; moved to `apps/embeddings/tests/test_gpu.py`
- All existing mock patterns (`patch("torch.cuda.is_available")`, ImportError handling, MPS path) are preserved verbatim

**Integration / view tests:**
- `TestHealthCheck` — `@pytest.mark.django_db`, uses `reverse("health-check")`; moved to `core/tests/test_views.py`
- GPU status view test — moved alongside `TestGetGpuStatus`

**Manual verification:**
- `curl http://localhost:8005/api/health/` → `{"status": "ok"}`
- `curl http://localhost:8005/api/embeddings/gpu-status/` → GPU info JSON
- Old URL `GET /api/gpu-status/` should return 404

---

## Risks & Notes

- **URL change for `gpu-status`:** Any consumer (frontend, monitoring scripts, docs) using `/api/gpu-status/` must be updated. Check `src/api/` in the frontend for hardcoded paths.
- **No model/migration changes:** The `pages` migrations folder contains only an empty `__init__.py`, so no `squashmigrations` or fake-migration steps are needed.
- **`pages` label in Django:** Because no `ContentType` rows reference `pages` (no models), removing it from `INSTALLED_APPS` is safe without a `post_migrate` cleanup.
- **Function-based views:** Both views use `@api_view` / `@permission_classes` decorators. When moving them, ensure the decorator imports are included in the destination file.
