import pytest
from django.urls import reverse


@pytest.mark.django_db
class TestHealthCheck:
    def test_health_check_returns_200(self, client):
        url = reverse("health-check")
        response = client.get(url)
        assert response.status_code == 200

    def test_health_check_returns_ok(self, client):
        url = reverse("health-check")
        response = client.get(url)
        assert response.json() == {"status": "ok"}
