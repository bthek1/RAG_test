from .base import *

DEBUG = False
ALLOWED_HOSTS = ["localhost", "127.0.0.1"]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

# Integration tests (marked with @pytest.mark.integration) target a real
# Postgres + pgvector instance.  Set INTEGRATION_DATABASE_URL to override.
INTEGRATION_DATABASE_URL = env(
    "INTEGRATION_DATABASE_URL",
    default="postgres://appuser:apppassword@localhost:5434/appdb",
)

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
DEFAULT_FROM_EMAIL = "root@localhost"

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# Run Celery tasks synchronously in tests — no broker required.
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
