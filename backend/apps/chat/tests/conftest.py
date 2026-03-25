import pytest


@pytest.fixture
def api_client():
    from rest_framework.test import APIClient

    return APIClient()


@pytest.fixture
def user(db):
    from django.contrib.auth import get_user_model

    User = get_user_model()
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
