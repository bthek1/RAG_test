from django.contrib import admin
from django.urls import include, path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from core.views import health_check

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/health/", health_check, name="health-check"),
    path("api/accounts/", include("apps.accounts.urls")),
    path("api/embeddings/", include("apps.embeddings.urls")),
    path("api/chat/", include("apps.chat.urls")),
    path("api/researcher/", include("apps.researcher.urls")),
]
