import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        email="chat@example.com",
        password="testpass123",
    )


@pytest.fixture
def authenticated_client(api_client, user):
    response = api_client.post(
        "/api/token/",
        {"email": "chat@example.com", "password": "testpass123"},
        format="json",
    )
    token = response.data["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return api_client
