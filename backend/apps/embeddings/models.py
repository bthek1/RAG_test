import uuid

from django.db import models
from pgvector.django import IvfflatIndex, VectorField


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
    embedding = VectorField(dimensions=1536)  # OpenAI text-embedding-ada-002 default
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["document", "chunk_index"]
        indexes = [
            IvfflatIndex(fields=["embedding"], name="chunk_embedding_ivfflat_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.document.title} — chunk {self.chunk_index}"
