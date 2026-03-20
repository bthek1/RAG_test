from django.urls import path

from .views import gpu_status, health_check

urlpatterns = [
    path("health/", health_check, name="health-check"),
    path("gpu-status/", gpu_status, name="gpu-status"),
]
