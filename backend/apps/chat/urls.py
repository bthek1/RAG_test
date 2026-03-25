from django.urls import path

from .views import ChatView, ModelListView, OllamaStatusView, chat_stream_view

urlpatterns = [
    path("status/", OllamaStatusView.as_view(), name="chat-ollama-status"),
    path("models/", ModelListView.as_view(), name="chat-models"),
    path("", ChatView.as_view(), name="chat"),
    path("stream/", chat_stream_view, name="chat-stream"),
]
