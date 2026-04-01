from rest_framework import serializers


class SearchRequestSerializer(serializers.Serializer):
    query = serializers.CharField(min_length=1, max_length=500)
    max_results = serializers.IntegerField(default=5, min_value=1, max_value=20)
    type = serializers.ChoiceField(
        choices=["web", "news", "video", "image", "all"],
        default="all",
    )
    sort = serializers.ChoiceField(
        choices=["relevance", "date", "popularity"],
        default="relevance",
    )


class SearchResultSerializer(serializers.Serializer):
    type = serializers.CharField()
    title = serializers.CharField()
    url = serializers.CharField()
    snippet = serializers.CharField()
    scraped_text = serializers.CharField()
    # News-specific
    source = serializers.CharField(required=False, allow_blank=True)
    published_at = serializers.CharField(required=False, allow_blank=True)
    # Video-specific
    video_url = serializers.CharField(required=False, allow_blank=True)
    thumbnail_url = serializers.CharField(required=False, allow_blank=True)
    # Image-specific
    images = serializers.ListField(
        child=serializers.CharField(allow_blank=True),
        required=False,
    )
    original_url = serializers.CharField(required=False, allow_blank=True)
