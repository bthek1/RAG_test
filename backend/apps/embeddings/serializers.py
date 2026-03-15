from rest_framework import serializers

from .models import Chunk, Document


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
