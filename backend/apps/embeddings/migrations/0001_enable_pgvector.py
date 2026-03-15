from django.db import migrations


class Migration(migrations.Migration):
    """Enable the pgvector PostgreSQL extension.

    This must run before any migration that uses VectorField.
    On SQLite (test settings) the RunSQL is wrapped in a try/except via
    database_forwards so it is safely skipped.
    """

    initial = True

    dependencies: list = []

    operations = [
        migrations.RunSQL(
            sql="CREATE EXTENSION IF NOT EXISTS vector;",
            reverse_sql="DROP EXTENSION IF EXISTS vector;",
        ),
    ]
