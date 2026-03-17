from __future__ import annotations

import math

import numpy as np
from django.contrib import admin, messages
from django.core.cache import cache
from django.db.models import Avg, Count, Max, Min, QuerySet
from django.http import HttpRequest
from django.template.response import TemplateResponse
from django.urls import path
from django.utils.html import format_html

from .models import Chunk, Document
from .services import search_similar_chunks

ADMIN_STATS_CACHE_KEY = "embeddings_admin_stats"
ADMIN_STATS_TTL = 60  # seconds

# ---------------------------------------------------------------------------
# Inline
# ---------------------------------------------------------------------------


class ChunkInline(admin.TabularInline):
    model = Chunk
    fields = ("chunk_index", "content_preview", "embedding_norm", "created_at")
    readonly_fields = (
        "chunk_index",
        "content_preview",
        "embedding_norm",
        "created_at",
    )
    extra = 0
    max_num = 0
    can_delete = False
    show_change_link = True

    def get_queryset(self, request: HttpRequest) -> QuerySet:
        # Defer the 1024-dim vector — expensive to load for every inline row
        return super().get_queryset(request).defer("embedding")

    @admin.display(description="Content Preview")
    def content_preview(self, obj: Chunk) -> str:
        text = obj.content
        if len(text) > 140:
            return format_html("{}&hellip;", text[:140])
        return text

    @admin.display(description="Norm")
    def embedding_norm(self, obj: Chunk) -> str:
        # embedding is deferred in list view; skip gracefully
        try:
            vec = list(obj.embedding) if obj.embedding is not None else None
        except Exception:
            vec = None
        if not vec:
            return "—"
        norm = math.sqrt(sum(v * v for v in vec))
        return f"{norm:.4f}"


# ---------------------------------------------------------------------------
# Document Admin
# ---------------------------------------------------------------------------


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("title", "source", "chunk_count", "content_preview", "created_at")
    search_fields = ("title", "source")
    readonly_fields = (
        "id",
        "created_at",
        "updated_at",
        "chunk_count",
        "content_preview",
    )
    date_hierarchy = "created_at"
    ordering = ("-created_at",)
    inlines = [ChunkInline]

    def get_queryset(self, request: HttpRequest) -> QuerySet:
        return super().get_queryset(request).annotate(_chunk_count=Count("chunks"))

    @admin.display(description="Chunks", ordering="_chunk_count")
    def chunk_count(self, obj: Document) -> int:
        return getattr(obj, "_chunk_count", 0)

    @admin.display(description="Content Preview")
    def content_preview(self, obj: Document) -> str:
        text = obj.content
        if len(text) > 200:
            return format_html("{}&hellip;", text[:200])
        return text

    # ------------------------------------------------------------------
    # Phase 4 — stats endpoint
    # ------------------------------------------------------------------

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "stats/",
                self.admin_site.admin_view(self.stats_view),
                name="embeddings_document_stats",
            ),
        ]
        return custom_urls + urls

    def stats_view(self, request: HttpRequest) -> TemplateResponse:
        stats = cache.get(ADMIN_STATS_CACHE_KEY)
        if stats is None:
            doc_agg = Document.objects.annotate(
                num_chunks=Count("chunks")
            ).aggregate(
                total_docs=Count("id"),
                avg_chunks=Avg("num_chunks"),
                max_chunks=Max("num_chunks"),
                min_chunks=Min("num_chunks"),
            )
            total_chunks = Chunk.objects.count()
            stats = {
                "total_docs": doc_agg["total_docs"] or 0,
                "total_chunks": total_chunks,
                "avg_chunks": round(doc_agg["avg_chunks"] or 0, 1),
                "max_chunks": doc_agg["max_chunks"] or 0,
                "min_chunks": doc_agg["min_chunks"] or 0,
                "storage_mb": round(total_chunks * 1024 * 4 / 1_000_000, 2),
            }
            cache.set(ADMIN_STATS_CACHE_KEY, stats, ADMIN_STATS_TTL)

        context = {
            **self.admin_site.each_context(request),
            "title": "Embeddings Statistics",
            "stats": stats,
        }
        return TemplateResponse(request, "admin/embeddings/stats.html", context)


# ---------------------------------------------------------------------------
# Chunk Admin
# ---------------------------------------------------------------------------


@admin.register(Chunk)
class ChunkAdmin(admin.ModelAdmin):
    list_display = (
        "document",
        "chunk_index",
        "content_preview",
        "embedding_norm",
        "created_at",
    )
    list_select_related = ("document",)
    list_filter = ("document", "created_at")
    search_fields = ("content", "document__title")
    ordering = ["document", "chunk_index"]
    readonly_fields = ("id", "created_at", "embedding_detail")
    exclude = ("embedding",)
    actions = ["find_nearest_neighbours"]

    @admin.display(description="Content Preview")
    def content_preview(self, obj: Chunk) -> str:
        text = obj.content
        if len(text) > 150:
            return format_html("{}&hellip;", text[:150])
        return text

    @admin.display(description="Norm")
    def embedding_norm(self, obj: Chunk) -> str:
        try:
            vec = list(obj.embedding) if obj.embedding is not None else None
        except Exception:
            vec = None
        if not vec:
            return "—"
        norm = math.sqrt(sum(v * v for v in vec))
        return f"{norm:.4f}"

    @admin.display(description="Embedding Vector Stats")
    def embedding_detail(self, obj: Chunk) -> str:
        if obj.embedding is None:
            return "No embedding stored."
        vec = list(obj.embedding)
        arr = np.array(vec, dtype=np.float64)
        dims = len(vec)
        norm = float(np.linalg.norm(arr))
        sparsity = float(np.sum(np.abs(arr) < 0.001)) / dims * 100
        first_10 = ", ".join(f"{v:.4f}" for v in vec[:10])
        return format_html(
            "<table style='border-collapse:collapse'>"
            "<tr><th style='text-align:left;padding:2px 8px'>Dimensions</th>"
            "<td style='padding:2px 8px'>{}</td></tr>"
            "<tr><th style='text-align:left;padding:2px 8px'>Norm</th>"
            "<td style='padding:2px 8px'>{}</td></tr>"
            "<tr><th style='text-align:left;padding:2px 8px'>Min</th>"
            "<td style='padding:2px 8px'>{}</td></tr>"
            "<tr><th style='text-align:left;padding:2px 8px'>Max</th>"
            "<td style='padding:2px 8px'>{}</td></tr>"
            "<tr><th style='text-align:left;padding:2px 8px'>Mean</th>"
            "<td style='padding:2px 8px'>{}</td></tr>"
            "<tr><th style='text-align:left;padding:2px 8px'>First 10 values</th>"
            "<td style='padding:2px 8px'>{}</td></tr>"
            "<tr><th style='text-align:left;padding:2px 8px'>Sparsity (&lt;0.001)</th>"
            "<td style='padding:2px 8px'>{}%</td></tr>"
            "</table>",
            dims,
            f"{norm:.6f}",
            f"{float(arr.min()):.6f}",
            f"{float(arr.max()):.6f}",
            f"{float(arr.mean()):.6f}",
            first_10,
            f"{sparsity:.2f}",
        )

    # ------------------------------------------------------------------
    # Phase 3 — nearest-neighbour action
    # ------------------------------------------------------------------

    @admin.action(description="Find 5 nearest neighbours")
    def find_nearest_neighbours(
        self, request: HttpRequest, queryset: QuerySet
    ) -> TemplateResponse | None:
        if queryset.count() != 1:
            self.message_user(
                request,
                "Please select exactly one chunk to find nearest neighbours.",
                messages.WARNING,
            )
            return None

        chunk = queryset.first()
        raw_results = search_similar_chunks(chunk.content, top_k=6)
        results = [r for r in raw_results if r.id != chunk.id][:5]

        context = {
            **self.admin_site.each_context(request),
            "title": f'Nearest Neighbours — Chunk {chunk.chunk_index} of "{chunk.document.title}"',
            "chunk": chunk,
            "results": results,
        }
        return TemplateResponse(
            request, "admin/embeddings/nearest_neighbours.html", context
        )
