from django.urls import path

from .views import ChatView, ModelListView, chat_stream_view

urlpatterns = [
    path("models/", ModelListView.as_view(), name="chat-models"),
    path("", ChatView.as_view(), name="chat"),
    path("stream/", chat_stream_view, name="chat-stream"),
]
