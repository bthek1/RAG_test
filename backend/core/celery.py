"""Celery application instance for the Django project.

The ``core`` app name is used as the Celery app name.  All task modules are
auto-discovered from each installed Django app's ``tasks.py``.

Usage (local dev):
    uv run celery -A core worker --loglevel=info

Usage (Docker):
    See ``celery_worker`` service in docker-compose.yml.
"""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings.dev")

app = Celery("core")

# Read Celery config from Django settings — keys must be prefixed with CELERY_
app.config_from_object("django.conf:settings", namespace="CELERY")

# Auto-discover tasks.py in every installed Django app
app.autodiscover_tasks()
