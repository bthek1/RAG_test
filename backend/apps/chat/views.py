import json

from django.http import StreamingHttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import ChatRequestSerializer
from .services import chat, list_models, stream_chat


class ModelListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        models = list_models()
        return Response({"models": models})


class ChatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        messages = serializer.validated_data["messages"]
        model = serializer.validated_data.get("model")
        reply = chat(messages, model)
        return Response({"reply": reply})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def chat_stream_view(request):
    serializer = ChatRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    messages = serializer.validated_data["messages"]
    model = serializer.validated_data.get("model")

    def event_stream():
        for token in stream_chat(messages, model):
            yield f"data: {json.dumps({'token': token})}\n\n"
        yield "data: [DONE]\n\n"

    response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response
