from rest_framework import serializers


class SearchRequestSerializer(serializers.Serializer):
    query = serializers.CharField(min_length=1, max_length=500)
    max_results = serializers.IntegerField(default=5, min_value=1, max_value=20)


class SearchResultSerializer(serializers.Serializer):
    title = serializers.CharField()
    url = serializers.URLField()
    snippet = serializers.CharField()
    scraped_text = serializers.CharField()
