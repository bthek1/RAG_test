"""Tests for django-celery-beat periodic task registration.

These tests verify that the Beat scheduler tables exist and that PeriodicTask
records can be created and queried via the Django ORM.

Run::

    cd backend && uv run pytest apps/embeddings/tests/test_beat.py -v
"""

from __future__ import annotations

import pytest
from django_celery_beat.models import IntervalSchedule, PeriodicTask


class TestBeatSchedulerModels:
    """Verify that Beat ORM models are available and writable."""

    @pytest.mark.django_db
    def test_interval_schedule_create(self):
        """IntervalSchedule can be created in the database."""
        schedule, created = IntervalSchedule.objects.get_or_create(
            every=60,
            period=IntervalSchedule.SECONDS,
        )
        assert schedule.pk is not None
        assert schedule.every == 60
        assert schedule.period == IntervalSchedule.SECONDS

    @pytest.mark.django_db
    def test_periodic_task_create(self):
        """PeriodicTask can be registered and retrieved via the ORM."""
        schedule, _ = IntervalSchedule.objects.get_or_create(
            every=300,
            period=IntervalSchedule.SECONDS,
        )
        task = PeriodicTask.objects.create(
            interval=schedule,
            name="test-cleanup-task",
            task="apps.embeddings.tasks.ingest_document",
            args="[]",
        )
        assert task.pk is not None
        assert task.name == "test-cleanup-task"
        assert task.task == "apps.embeddings.tasks.ingest_document"
        assert task.enabled is True

    @pytest.mark.django_db
    def test_periodic_task_can_be_disabled(self):
        """PeriodicTask.enabled can be toggled off."""
        schedule, _ = IntervalSchedule.objects.get_or_create(
            every=60,
            period=IntervalSchedule.SECONDS,
        )
        task = PeriodicTask.objects.create(
            interval=schedule,
            name="test-disabled-task",
            task="apps.embeddings.tasks.reembed_document",
            args="[]",
            enabled=False,
        )
        assert task.enabled is False
        fetched = PeriodicTask.objects.get(pk=task.pk)
        assert fetched.enabled is False

    @pytest.mark.django_db
    def test_periodic_task_list_returns_registered_task(self):
        """PeriodicTask queryset returns the task after creation."""
        schedule, _ = IntervalSchedule.objects.get_or_create(
            every=120,
            period=IntervalSchedule.SECONDS,
        )
        PeriodicTask.objects.create(
            interval=schedule,
            name="test-listed-task",
            task="apps.embeddings.tasks.ingest_document",
            args="[]",
        )
        names = list(
            PeriodicTask.objects.filter(name="test-listed-task").values_list(
                "name", flat=True
            )
        )
        assert "test-listed-task" in names
