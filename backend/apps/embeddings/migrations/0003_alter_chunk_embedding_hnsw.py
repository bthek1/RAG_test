"""Switch Chunk.embedding from 1536-dim (OpenAI) to 1024-dim (BGE-large)
and replace the IvfflatIndex with an HnswIndex.
"""

import pgvector.django.indexes
import pgvector.django.vector
from django.db import migrations


def _remove_ivfflat_index(apps, schema_editor):
    """Drop IvfflatIndex — no-op on non-PostgreSQL backends."""
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute('DROP INDEX IF EXISTS "chunk_embedding_ivfflat_idx"')


def _restore_ivfflat_index(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    Chunk = apps.get_model("embeddings", "Chunk")
    index = pgvector.django.indexes.IvfflatIndex(
        fields=["embedding"],
        name="chunk_embedding_ivfflat_idx",
    )
    schema_editor.add_index(Chunk, index)


def _add_hnsw_index(apps, schema_editor):
    """Create HnswIndex — no-op on non-PostgreSQL backends."""
    if schema_editor.connection.vendor != "postgresql":
        return
    Chunk = apps.get_model("embeddings", "Chunk")
    index = pgvector.django.indexes.HnswIndex(
        ef_construction=64,
        fields=["embedding"],
        m=16,
        name="chunk_embedding_hnsw_idx",
        opclasses=["vector_cosine_ops"],
    )
    schema_editor.add_index(Chunk, index)


def _remove_hnsw_index(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute('DROP INDEX IF EXISTS "chunk_embedding_hnsw_idx"')


class Migration(migrations.Migration):

    dependencies = [
        ("embeddings", "0002_initial"),
    ]

    operations = [
        # 1. Drop the old IVFFlat index
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RemoveIndex(
                    model_name="chunk",
                    name="chunk_embedding_ivfflat_idx",
                ),
            ],
            database_operations=[
                migrations.RunPython(_remove_ivfflat_index, _restore_ivfflat_index),
            ],
        ),
        # 2. Alter the VectorField dimension from 1536 → 1024
        migrations.AlterField(
            model_name="chunk",
            name="embedding",
            field=pgvector.django.vector.VectorField(dimensions=1024),
        ),
        # 3. Create the new HNSW index with cosine ops
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddIndex(
                    model_name="chunk",
                    index=pgvector.django.indexes.HnswIndex(
                        ef_construction=64,
                        fields=["embedding"],
                        m=16,
                        name="chunk_embedding_hnsw_idx",
                        opclasses=["vector_cosine_ops"],
                    ),
                ),
            ],
            database_operations=[
                migrations.RunPython(_add_hnsw_index, _remove_hnsw_index),
            ],
        ),
    ]
