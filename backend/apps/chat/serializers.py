from rest_framework import serializers


class ChatMessageSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["user", "assistant", "system"])
    content = serializers.CharField()


class ChatRequestSerializer(serializers.Serializer):
    messages = ChatMessageSerializer(many=True)
    model = serializers.CharField(required=False)

    def validate_messages(self, value):
        if not value:
            raise serializers.ValidationError("messages must not be empty.")
        return value
