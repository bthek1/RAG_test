from django.db import migrations


def _enable_pgvector(apps, schema_editor):
    """Create the pgvector extension — no-op on non-PostgreSQL backends."""
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute("CREATE EXTENSION IF NOT EXISTS vector;")


def _disable_pgvector(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute("DROP EXTENSION IF EXISTS vector;")


class Migration(migrations.Migration):
    """Enable the pgvector PostgreSQL extension.

    Uses RunPython with a vendor check so it is safely skipped on SQLite
    (unit-test settings) and only runs against real PostgreSQL instances.
    """

    initial = True

    dependencies: list = []

    operations = [
        migrations.RunPython(_enable_pgvector, _disable_pgvector),
    ]
