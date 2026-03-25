# Root conftest.py — shared fixtures can be added here.
import pytest


def pytest_collection_modifyitems(items):
    """Auto-skip @pytest.mark.integration tests when the default DB is SQLite.

    Integration tests require PostgreSQL + pgvector.  The unit-test database
    (core/settings/test.py) uses SQLite for speed; running pgvector-specific
    queries against it will always fail.  Mark those items as skipped so the
    rest of the suite can run cleanly.
    """
    try:
        from django.conf import settings

        engine = settings.DATABASES.get("default", {}).get("ENGINE", "")
    except Exception:
        return
    if "sqlite" not in engine:
        return

    skip = pytest.mark.skip(
        reason="Requires PostgreSQL + pgvector — skipped on SQLite test DB"
    )
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip)


@pytest.fixture(scope="session")
def celery_config():
    """Session-scoped Celery config override for pytest-celery integration tests."""
    return {
        "broker_url": "memory://",
        "result_backend": "cache+memory://",
    }
