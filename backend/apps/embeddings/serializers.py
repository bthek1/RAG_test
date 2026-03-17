from rest_framework import serializers

from .models import Chunk, Document


class DocumentIngestSerializer(serializers.Serializer):
    """Accepts either plaintext `content` or a PDF `file` — not both."""

    title = serializers.CharField(max_length=512)
    source = serializers.CharField(max_length=1024, required=False, allow_blank=True)
    content = serializers.CharField(required=False, allow_blank=False)
    file = serializers.FileField(required=False)

    def validate_file(self, value):
        max_mb = 50
        if value.size > max_mb * 1024 * 1024:
            raise serializers.ValidationError(f"PDF must be under {max_mb} MB.")
        if not value.name.lower().endswith(".pdf"):
            raise serializers.ValidationError("Only PDF files are accepted.")
        return value

    def validate(self, data):
        has_content = bool(data.get("content", "").strip())
        has_file = bool(data.get("file"))
        if not has_content and not has_file:
            raise serializers.ValidationError(
                "Provide either 'content' (text) or 'file' (PDF)."
            )
        if has_content and has_file:
            raise serializers.ValidationError("Provide 'content' or 'file', not both.")
        return data


class ChunkSerializer(serializers.ModelSerializer):
    distance = serializers.FloatField(read_only=True, required=False)

    class Meta:
        model = Chunk
        fields = ["id", "document", "content", "chunk_index", "created_at", "distance"]
        read_only_fields = ["id", "document", "chunk_index", "created_at"]


class DocumentSerializer(serializers.ModelSerializer):
    chunk_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Document
        fields = [
            "id",
            "title",
            "source",
            "content",
            "created_at",
            "updated_at",
            "chunk_count",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class DocumentListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list view — omits the full content body."""

    chunk_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Document
        fields = ["id", "title", "source", "created_at", "updated_at", "chunk_count"]
        read_only_fields = ["id", "created_at", "updated_at"]


class SimilaritySearchSerializer(serializers.Serializer):
    query = serializers.CharField(min_length=1)
    top_k = serializers.IntegerField(min_value=1, max_value=50, default=5)


class RAGSourceSerializer(serializers.Serializer):
    chunk_id = serializers.UUIDField()
    document_title = serializers.CharField()
    content = serializers.CharField()
    distance = serializers.FloatField()


class RAGRequestSerializer(serializers.Serializer):
    query = serializers.CharField(min_length=1)
    top_k = serializers.IntegerField(min_value=1, max_value=50, default=5)


class RAGResponseSerializer(serializers.Serializer):
    answer = serializers.CharField()
    sources = RAGSourceSerializer(many=True)
