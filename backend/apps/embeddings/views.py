from django.db.models import Count
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .models import Document
from .serializers import (
    ChunkSerializer,
    DocumentListSerializer,
    DocumentSerializer,
    RAGRequestSerializer,
    RAGResponseSerializer,
    SimilaritySearchSerializer,
)


class DocumentListCreateView(generics.ListCreateAPIView):
    """GET /api/embeddings/documents/  — list documents (paginated).
    POST /api/embeddings/documents/ — ingest a new document.
    """

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Document.objects.annotate(chunk_count=Count("chunks")).order_by(
            "-created_at"
        )

    def get_serializer_class(self):
        if self.request.method == "POST":
            return DocumentSerializer
        return DocumentListSerializer

    def perform_create(self, serializer):
        # Delegate to the service layer; ignore the default save()
        services.ingest_document(
            title=serializer.validated_data["title"],
            content=serializer.validated_data["content"],
            source=serializer.validated_data.get("source", ""),
        )

    def create(self, request: Request, *_args, **_kwargs) -> Response:
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        # Re-query to include chunk_count
        document = (
            Document.objects.annotate(chunk_count=Count("chunks"))
            .order_by("-created_at")
            .first()
        )
        out = DocumentSerializer(document)
        return Response(out.data, status=status.HTTP_201_CREATED)


class DocumentDetailView(generics.RetrieveDestroyAPIView):
    """GET  /api/embeddings/documents/{id}/  — get document + chunk count.
    DELETE /api/embeddings/documents/{id}/  — delete document and all its chunks.
    """

    permission_classes = [IsAuthenticated]
    lookup_field = "id"

    def get_queryset(self):
        return Document.objects.annotate(chunk_count=Count("chunks"))

    def get_serializer_class(self):
        return DocumentSerializer


class SimilaritySearchView(APIView):
    """POST /api/embeddings/search/  — similarity search over chunks."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = SimilaritySearchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        chunks = services.search_similar_chunks(
            query=serializer.validated_data["query"],
            top_k=serializer.validated_data["top_k"],
        )
        return Response(ChunkSerializer(chunks, many=True).data)


class RAGView(APIView):
    """POST /api/embeddings/rag/

    Retrieve top-k chunks then generate a Claude answer.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = RAGRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        query = serializer.validated_data["query"]
        top_k = serializer.validated_data["top_k"]

        chunks = list(services.search_similar_chunks(query=query, top_k=top_k))
        answer = services.generate_answer(query=query, context_chunks=chunks)

        sources = [
            {
                "chunk_id": chunk.id,
                "document_title": chunk.document.title,
                "content": chunk.content,
                "distance": getattr(chunk, "distance", None),
            }
            for chunk in chunks
        ]

        out = RAGResponseSerializer({"answer": answer, "sources": sources})
        return Response(out.data)
