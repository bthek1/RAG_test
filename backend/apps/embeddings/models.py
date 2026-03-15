import uuid

from django.db import models
from pgvector.django import HnswIndex, VectorField


class Document(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=512)
    source = models.TextField(blank=True)  # URL or file path
    content = models.TextField()  # raw full text
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.title


class Chunk(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(
        Document, on_delete=models.CASCADE, related_name="chunks"
    )
    content = models.TextField()
    chunk_index = models.PositiveIntegerField()  # position within the document
    embedding = VectorField(dimensions=1024)  # BAAI/bge-large-en-v1.5 (1024-dim)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["document", "chunk_index"]
        indexes = [
            HnswIndex(
                fields=["embedding"],
                name="chunk_embedding_hnsw_idx",
                m=16,
                ef_construction=64,
                opclasses=["vector_cosine_ops"],
            ),
        ]

    def __str__(self) -> str:
        return f"{self.document.title} — chunk {self.chunk_index}"
