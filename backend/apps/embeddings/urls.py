from django.urls import path

from .views import (
    DocumentChunkListView,
    DocumentDetailView,
    DocumentListCreateView,
    DocumentStatusView,
    RAGView,
    RevokeTaskView,
    SimilaritySearchView,
    TaskStatusView,
)

urlpatterns = [
    path("documents/", DocumentListCreateView.as_view(), name="document-list-create"),
    path("documents/<uuid:id>/", DocumentDetailView.as_view(), name="document-detail"),
    path(
        "documents/<uuid:id>/chunks/",
        DocumentChunkListView.as_view(),
        name="document-chunk-list",
    ),
    path(
        "documents/<uuid:id>/status/",
        DocumentStatusView.as_view(),
        name="document-status",
    ),
    path("search/", SimilaritySearchView.as_view(), name="similarity-search"),
    path("rag/", RAGView.as_view(), name="rag"),
    path("tasks/<str:task_id>/", TaskStatusView.as_view(), name="task-status"),
    path(
        "tasks/<str:task_id>/revoke/",
        RevokeTaskView.as_view(),
        name="task-revoke",
    ),
]
