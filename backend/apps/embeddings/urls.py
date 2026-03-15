from django.urls import path

from .views import DocumentDetailView, DocumentListCreateView, SimilaritySearchView

urlpatterns = [
    path("documents/", DocumentListCreateView.as_view(), name="document-list-create"),
    path("documents/<uuid:id>/", DocumentDetailView.as_view(), name="document-detail"),
    path("search/", SimilaritySearchView.as_view(), name="similarity-search"),
]
