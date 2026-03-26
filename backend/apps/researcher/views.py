from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import SearchRequestSerializer, SearchResultSerializer
from .services import run_search


class SearchView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        req = SearchRequestSerializer(data=request.data)
        req.is_valid(raise_exception=True)
        results = run_search(**req.validated_data)
        return Response(SearchResultSerializer(results, many=True).data)
