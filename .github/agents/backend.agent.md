---
name: backend
description: "Use for backend-only Django tasks: models, views, serializers, services, migrations, Celery tasks, tests, and RAG/embeddings work. Restricts tool use to backend/ and docs/."
tools: read_file, replace_string_in_file, multi_replace_string_in_file, create_file, run_in_terminal, grep_search, file_search, semantic_search, get_errors
---

# Backend Agent

Focused on `backend/` only. See [`.github/copilot-instructions.md`](../copilot-instructions.md) for full conventions.

## Key Facts

- **Run dev server:** `just be-dev` → `http://localhost:8004`
- **Run tests:** `just be-test` | single: `cd backend && uv run pytest <path>::<test> -v`
- **Lint / format:** `just be-lint` / `just be-fmt`
- **Type check:** `cd backend && uv run mypy .`
- **Migrations:** always `just be-makemigrations <app>` then `just be-migrate` after model changes

## Apps

| App          | Endpoint prefix           | Notes                                                          |
| ------------ | ------------------------- | -------------------------------------------------------------- |
| `accounts`   | `/api/` (token endpoints) | CustomUser, email auth, JWT simplejwt                          |
| `chat`       | `/api/chat/`              | Ollama (httpx client) — requires separate Ollama server        |
| `researcher` | `/api/researcher/`        | DuckDuckGo (`ddgs`) + scraping — no API key needed             |
| `embeddings` | `/api/embeddings/`        | RAG: Celery ingest, pgvector HNSW, Anthropic Claude generation |

## Critical Patterns

```python
# Always use get_user_model(), never import User directly
from django.contrib.auth import get_user_model
User = get_user_model()

# UUID primary keys on all models
id = models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True)

# Business logic in services.py, not views.py
# Serializers in serializers.py, not views.py
```

## Test Conventions

- Settings: `DJANGO_SETTINGS_MODULE=core.settings.test` (SQLite, fast hasher, eager Celery)
- Fixtures: `factory-boy` in `factories.py` per app, root `backend/conftest.py`
- Markers: `slow`, `integration`, `development`
- Integration tests can use real Postgres via `INTEGRATION_DATABASE_URL` env var

## Do Not

- Import `User` directly — always `get_user_model()`
- Put logic in views — use `services.py`
- Use `requests` in the chat app — it uses `httpx`
- Delete or modify migration files manually
- Hardcode credentials — use `django-environ`
