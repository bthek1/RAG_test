# pgvector Database Setup Plan

## Overview
This document outlines the step-by-step process to integrate pgvector (PostgreSQL vector similarity search) into the Django application for RAG (Retrieval-Augmented Generation) capabilities.

## Prerequisites
- PostgreSQL 16 (already in docker-compose.yml)
- Django 5.1+
- Python 3.13+

## Phase 1: Environment Setup

### 1.1 Update Docker Compose Configuration
**File:** `docker-compose.yml`

Add pgvector extension initialization to PostgreSQL service:

```yaml
db:
  image: postgres:16
  environment:
    POSTGRES_DB: appdb
    POSTGRES_USER: appuser
    POSTGRES_PASSWORD: apppassword
  ports:
    - "5434:5432"
  volumes:
    - postgres_data:/var/lib/postgresql/data/
    - ./init-pgvector.sql:/docker-entrypoint-initdb.d/init-pgvector.sql
```

### 1.2 Create pgvector Initialization Script
**File:** `init-pgvector.sql`

This script will be executed when the PostgreSQL container starts:

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create index type (optional but recommended for performance)
-- This will allow HNSW indexing for faster similarity searches
```

---

## Phase 2: Python Dependencies

### 2.1 Update Project Dependencies
**File:** `backend/pyproject.toml`

Add the following packages to the `dependencies` section:

```toml
dependencies = [
  "django ~=5.1",
  "djangorestframework ~=3.15",
  "djangorestframework-simplejwt ~=5.3",
  "django-cors-headers ~=4.4",
  "django-environ ~=0.11",
  "gunicorn ~=23.0",
  "psycopg[binary] ~=3.2",
  # Vector/Embedding dependencies
  "django-pgvector ~=0.3",
  "pgvector ~=0.3",
  "numpy ~=1.26",
]
```

Add development dependencies if using embeddings for testing:

```toml
dev = [
  # ... existing deps ...
  "openai ~=1.3",  # Optional: for testing with OpenAI embeddings
]
```

### 2.2 Install Dependencies
**Command:**

```bash
just be-install
# or
cd backend && uv sync
```

---

## Phase 3: Django Configuration

### 3.1 Register pgvector App
**File:** `backend/core/settings/base.py`

Add pgvector to `INSTALLED_APPS`:

```python
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "pgvector.django",  # Add this
    # Local
    "apps.accounts",
    "apps.pages",
]
```

### 3.2 Optional: Vector Configuration
Add optional pgvector settings to `base.py`:

```python
# Vector similarity search configuration
PGVECTOR_CONFIG = {
    "EMBEDDING_DIMENSION": 1536,  # OpenAI ada-002 dimension
    "SIMILARITY_THRESHOLD": 0.7,  # For relevance filtering
}
```

---

## Phase 4: Create Models

### 4.1 Create Embeddings App (Optional)
**Command:**

```bash
cd backend && python manage.py startapp embeddings
```

Add to `INSTALLED_APPS` in `base.py`:

```python
"apps.embeddings",
```

### 4.2 Create Embedding Models
**File:** `backend/apps/embeddings/models.py`

```python
import uuid

from django.db import models
from pgvector.django import VectorField

from apps.accounts.models import CustomUser


class Document(models.Model):
    """Base model for storing documents with embeddings."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        CustomUser, on_delete=models.CASCADE, related_name="documents"
    )
    title = models.CharField(max_length=255)
    content = models.TextField()
    embedding = VectorField(dimensions=1536, null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
        ]

    def __str__(self):
        return self.title


class EmbeddingChunk(models.Model):
    """Store text chunks with their vector embeddings for semantic search."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(
        Document, on_delete=models.CASCADE, related_name="chunks"
    )
    text = models.TextField()
    embedding = VectorField(dimensions=1536)  # Required field
    chunk_index = models.IntegerField()  # Track order of chunks
    tokens = models.IntegerField(default=0)  # Token count for cost tracking
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["document", "chunk_index"]
        indexes = [
            models.Index(fields=["document", "chunk_index"]),
        ]
        unique_together = [["document", "chunk_index"]]

    def __str__(self):
        return f"Chunk {self.chunk_index} - {self.document.title}"
```

### 4.3 Create Serializers
**File:** `backend/apps/embeddings/serializers.py`

```python
from rest_framework import serializers

from .models import Document, EmbeddingChunk


class EmbeddingChunkSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmbeddingChunk
        fields = ["id", "text", "chunk_index", "tokens", "created_at"]
        read_only_fields = ["id", "created_at"]


class DocumentSerializer(serializers.ModelSerializer):
    chunks = EmbeddingChunkSerializer(many=True, read_only=True)
    embedding_status = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            "id",
            "title",
            "content",
            "metadata",
            "embedding_status",
            "chunks",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_embedding_status(self, obj):
        return "embedded" if obj.embedding is not None else "pending"


class DocumentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Document
        fields = ["title", "content", "metadata"]
```

---

## Phase 5: Create Migrations

### 5.1 Generate Migration
**Command:**

```bash
cd backend && python manage.py makemigrations embeddings
```

### 5.2 Review Migration
Check the generated migration file in `backend/apps/embeddings/migrations/` to ensure:
- VectorField is properly created with correct dimensions
- Indexes are created for performance
- All required constraints are present

### 5.3 Apply Migrations
**Command:**

```bash
cd backend && python manage.py migrate
```

**Verify:** Query the database to confirm the pgvector extension is active:

```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
```

---

## Phase 6: Create Services Layer

### 6.1 Embedding Service
**File:** `backend/apps/embeddings/services.py`

```python
import numpy as np
from pgvector.django import CosineDistance

from .models import Document, EmbeddingChunk


class EmbeddingService:
    """Service for embedding and similarity search operations."""

    @staticmethod
    def search_similar_chunks(query_embedding: list[float], limit: int = 5):
        """
        Search for chunks similar to the query embedding using cosine distance.
        
        Args:
            query_embedding: Vector embedding of the query
            limit: Number of results to return
            
        Returns:
            QuerySet of EmbeddingChunk ordered by similarity
        """
        query_vector = np.array(query_embedding)
        return (
            EmbeddingChunk.objects.annotate(
                distance=CosineDistance("embedding", query_vector)
            )
            .order_by("distance")[:limit]
        )

    @staticmethod
    def search_similar_documents(query_embedding: list[float], limit: int = 5):
        """
        Search for documents similar to the query embedding.
        
        Args:
            query_embedding: Vector embedding of the query
            limit: Number of results to return
            
        Returns:
            QuerySet of Document ordered by similarity
        """
        query_vector = np.array(query_embedding)
        return (
            Document.objects.filter(embedding__isnull=False)
            .annotate(distance=CosineDistance("embedding", query_vector))
            .order_by("distance")[:limit]
        )
```

---

## Phase 7: Create API Endpoints

### 7.1 Create Views
**File:** `backend/apps/embeddings/views.py`

```python
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import Document, EmbeddingChunk
from .serializers import DocumentSerializer, DocumentCreateSerializer
from .services import EmbeddingService


class DocumentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing documents with embeddings.
    
    Endpoints:
    - POST /api/documents/ - Create new document
    - GET /api/documents/ - List user's documents
    - GET /api/documents/{id}/ - Retrieve document details
    - PUT /api/documents/{id}/ - Update document
    - DELETE /api/documents/{id}/ - Delete document
    - POST /api/documents/{id}/embed/ - Generate embeddings for document
    - POST /api/documents/search/ - Search similar documents
    """

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Filter documents by current user."""
        return Document.objects.filter(user=self.request.user)

    def get_serializer_class(self):
        if self.action == "create":
            return DocumentCreateSerializer
        return DocumentSerializer

    def perform_create(self, serializer):
        """Set user when creating document."""
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["post"])
    def embed(self, request, pk=None):
        """
        Generate embeddings for a document and its chunks.
        
        Requires: embedding_provider (e.g., 'openai')
        """
        document = self.get_object()
        provider = request.data.get("embedding_provider", "openai")
        
        # TODO: Implement embedding generation logic
        # This would integrate with OpenAI, Hugging Face, or other providers
        
        return Response(
            {"detail": "Embedding generation started"},
            status=status.HTTP_202_ACCEPTED
        )

    @action(detail=False, methods=["post"])
    def search(self, request):
        """
        Search for documents by embedding similarity.
        
        Request body:
        {
            "query_embedding": [list of floats],
            "limit": 5
        }
        """
        query_embedding = request.data.get("query_embedding")
        limit = request.data.get("limit", 5)

        if not query_embedding:
            return Response(
                {"error": "query_embedding is required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        results = EmbeddingService.search_similar_documents(
            query_embedding, limit
        )
        serializer = self.get_serializer(results, many=True)
        return Response(serializer.data)
```

### 7.2 Create URLs
**File:** `backend/apps/embeddings/urls.py`

```python
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import DocumentViewSet

router = DefaultRouter()
router.register(r"documents", DocumentViewSet, basename="document")

urlpatterns = [
    path("", include(router.urls)),
]
```

### 7.3 Register URLs in Core
**File:** `backend/core/urls.py`

```python
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.embeddings.urls")),
    # ... other routes
]
```

---

## Phase 8: Testing

### 8.1 Create Test Fixtures
**File:** `backend/apps/embeddings/tests/conftest.py`

```python
import pytest
from apps.accounts.models import CustomUser
from apps.embeddings.models import Document, EmbeddingChunk


@pytest.fixture
def test_user(db):
    """Create a test user."""
    return CustomUser.objects.create_user(
        email="test@example.com",
        password="testpass123"
    )


@pytest.fixture
def test_document(db, test_user):
    """Create a test document."""
    return Document.objects.create(
        user=test_user,
        title="Test Document",
        content="This is test content for vector search"
    )


@pytest.fixture
def test_embedding():
    """Generate a sample embedding vector."""
    import numpy as np
    return np.random.randn(1536).tolist()
```

### 8.2 Create Model Tests
**File:** `backend/apps/embeddings/tests/test_models.py`

```python
import pytest
from apps.embeddings.models import Document, EmbeddingChunk


@pytest.mark.django_db
class TestDocument:
    def test_create_document(self, test_user):
        doc = Document.objects.create(
            user=test_user,
            title="Test",
            content="Test content"
        )
        assert doc.title == "Test"
        assert doc.user == test_user

    def test_document_without_embedding(self, test_document):
        assert test_document.embedding is None


@pytest.mark.django_db
class TestEmbeddingChunk:
    def test_create_chunk_with_embedding(self, test_document, test_embedding):
        chunk = EmbeddingChunk.objects.create(
            document=test_document,
            text="Sample chunk text",
            embedding=test_embedding,
            chunk_index=0
        )
        assert chunk.chunk_index == 0
        assert len(chunk.embedding) == 1536
```

### 8.3 Create Service Tests
**File:** `backend/apps/embeddings/tests/test_services.py`

```python
import numpy as np
import pytest

from apps.embeddings.services import EmbeddingService


@pytest.mark.django_db
class TestEmbeddingService:
    def test_search_similar_chunks(self, test_document, test_embedding):
        # Create test chunk
        from apps.embeddings.models import EmbeddingChunk
        
        EmbeddingChunk.objects.create(
            document=test_document,
            text="Test chunk",
            embedding=test_embedding,
            chunk_index=0
        )

        # Search for similar
        results = EmbeddingService.search_similar_chunks(
            test_embedding, limit=5
        )
        assert results.count() >= 1
```

### 8.4 Run Tests
**Command:**

```bash
just be-test
# or
cd backend && uv run pytest apps/embeddings/tests/ -v
```

---

## Phase 9: Performance Optimization

### 9.1 Add HNSW Index (Optional)
**File:** `backend/apps/embeddings/migrations/0002_add_vector_indexes.py`

```python
from django.db import migrations

class Migration(migrations.Migration):
    dependencies = [
        ("embeddings", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            CREATE INDEX ON embeddings_embeddingchunk 
            USING hnsw (embedding vector_cosine_ops)
            WITH (m=16, ef_construction=200);
            
            CREATE INDEX ON embeddings_document 
            USING hnsw (embedding vector_cosine_ops)
            WITH (m=16, ef_construction=200);
            """,
            reverse_sql="""
            DROP INDEX IF EXISTS embeddings_embeddingchunk_embedding_idx;
            DROP INDEX IF EXISTS embeddings_document_embedding_idx;
            """,
        ),
    ]
```

### 9.2 Database Maintenance
Add periodic VACUUM and ANALYZE operations:

```bash
# In production, schedule via cron or APScheduler
python manage.py dbshell
VACUUM ANALYZE;
```

---

## Phase 10: Integration with Embedding Providers

### 10.1 Create Abstract Service (Optional)
**File:** `backend/apps/embeddings/providers.py`

```python
from abc import ABC, abstractmethod
from typing import List


class EmbeddingProvider(ABC):
    """Abstract base class for embedding providers."""

    @abstractmethod
    def embed_text(self, text: str) -> List[float]:
        """Convert text to embedding vector."""
        pass

    @abstractmethod
    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Convert multiple texts to embedding vectors."""
        pass


class OpenAIEmbeddingProvider(EmbeddingProvider):
    """OpenAI embedding provider implementation."""

    def __init__(self, api_key: str, model: str = "text-embedding-3-small"):
        self.api_key = api_key
        self.model = model
        # self.client = OpenAI(api_key=api_key)

    def embed_text(self, text: str) -> List[float]:
        # Implementation using OpenAI API
        pass

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        # Batch implementation
        pass
```

---

## Verification Checklist

After completing all phases, verify:

- [ ] PostgreSQL container has pgvector extension installed
- [ ] `django-pgvector` and `pgvector` packages are installed
- [ ] Embeddings app is registered in `INSTALLED_APPS`
- [ ] Migrations are created and applied successfully
- [ ] Models have VectorField columns with correct dimensions
- [ ] API endpoints are accessible and functional
- [ ] Test suite passes (especially embeddings tests)
- [ ] Vector similarity search works correctly
- [ ] Database indexes are created (if HNSW is enabled)
- [ ] Performance is acceptable for expected query volume

---

## Commands Reference

```bash
# Install dependencies
just be-install

# Create migrations
cd backend && python manage.py makemigrations embeddings

# Apply migrations
cd backend && python manage.py migrate

# Run tests
just be-test

# Run specific test
cd backend && uv run pytest apps/embeddings/tests/test_models.py -v

# Type checking
cd backend && uv run mypy apps/embeddings/

# Linting
just be-lint

# Format code
just be-fmt
```

---

## References

- [django-pgvector Documentation](https://github.com/pgvector/pgvector-python)
- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [PostgreSQL Vector Extension](https://pgvector.io/)
- [Django ORM Vector Field](https://docs.djangoproject.com/en/5.1/)

---

## Next Steps (Post-Implementation)

1. Integrate with embedding provider (OpenAI, Hugging Face, etc.)
2. Implement chunking strategy for large documents
3. Add token counting for cost tracking
4. Create background tasks for async embedding generation
5. Implement vector caching for frequently queried documents
6. Add monitoring and logging for vector operations
7. Develop UI components for document upload and search
8. Set up production database backups with vector data
