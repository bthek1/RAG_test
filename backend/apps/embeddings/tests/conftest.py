"""Shared pytest fixtures for the embeddings test suite."""

from __future__ import annotations

import numpy as np
import pytest
from django.contrib.auth import get_user_model

from apps.embeddings.services import EMBEDDING_DIMENSIONS

User = get_user_model()


@pytest.fixture
@pytest.mark.django_db
def admin_user(db):
    """Create a superuser for admin view tests."""
    return User.objects.create_superuser(
        email="admin@example.com",
        password="adminpassword",
    )


@pytest.fixture
def fake_embed(monkeypatch):
    """Monkeypatch embed_texts to return zero vectors — no model load required."""

    def _zero_embed(texts: list[str]) -> list[list[float]]:
        return [[0.0] * EMBEDDING_DIMENSIONS for _ in texts]

    monkeypatch.setattr("apps.embeddings.services.embed_texts", _zero_embed)
    return _zero_embed


@pytest.fixture
def fake_model(monkeypatch):
    """Monkeypatch get_embedding_model to return a dummy encoder."""

    class _FakeModel:
        def encode(self, texts, **kw):
            return np.zeros((len(texts), EMBEDDING_DIMENSIONS), dtype=np.float32)

    fake_instance = _FakeModel()
    monkeypatch.setattr(
        "apps.embeddings.services.get_embedding_model", lambda: fake_instance
    )


@pytest.fixture
def eager_celery(settings):
    """Force Celery tasks to run synchronously in the current process.

    Useful in tests that need to control the eager/async boundary explicitly
    without relying on the global test-settings default.
    """
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = True
