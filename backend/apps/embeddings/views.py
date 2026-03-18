from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import generics, serializers, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services, tasks
from .models import Chunk, Document
from .serializers import (
    ChunkSerializer,
    DocumentIngestSerializer,
    DocumentListSerializer,
    DocumentSerializer,
    DocumentStatusSerializer,
    RAGRequestSerializer,
    RAGResponseSerializer,
    SimilaritySearchSerializer,
)


class DocumentListCreateView(generics.ListCreateAPIView):
    """GET /api/embeddings/documents/  — list documents (paginated).
    POST /api/embeddings/documents/ — ingest a document (JSON text or multipart PDF).
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        return Document.objects.annotate(chunk_count=Count("chunks")).order_by(
            "-created_at"
        )

    def get_serializer_class(self):
        if self.request.method == "POST":
            return DocumentIngestSerializer
        return DocumentListSerializer

    def perform_create(self, serializer):
        data = serializer.validated_data
        if data.get("file"):
            try:
                content = services.extract_text_from_file(
                    data["file"].name, data["file"].read()
                )
            except (ValueError, Exception) as exc:
                raise serializers.ValidationError({"file": str(exc)}) from exc
        else:
            content = data["content"]

        document = Document.objects.create(
            title=data["title"],
            content=content,
            source=data.get("source", ""),
        )
        tasks.ingest_document.delay(str(document.pk))
        self._created_document = document

    def create(self, request: Request, *_args, **_kwargs) -> Response:
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        document = Document.objects.annotate(chunk_count=Count("chunks")).get(
            pk=self._created_document.pk
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


class DocumentChunkListView(generics.ListAPIView):
    """GET /api/embeddings/documents/{id}/chunks/ — list all chunks for a document."""

    permission_classes = [IsAuthenticated]
    serializer_class = ChunkSerializer

    def get_queryset(self):
        doc = get_object_or_404(Document, id=self.kwargs["id"])
        return (
            Chunk.objects.filter(document=doc)
            .select_related("document")
            .order_by("chunk_index")
        )


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


class DocumentStatusView(APIView):
    """GET /api/embeddings/documents/{id}/status/ — get document processing status."""

    permission_classes = [IsAuthenticated]

    def get(self, _request: Request, id) -> Response:
        document = get_object_or_404(
            Document.objects.annotate(chunk_count=Count("chunks")),
            id=id,
        )
        out = DocumentStatusSerializer(document)
        return Response(out.data)
