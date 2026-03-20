from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .services import get_gpu_status


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    return Response({"status": "ok"})


@api_view(["GET"])
@permission_classes([AllowAny])
def gpu_status(request):
    return Response(get_gpu_status())
