import builtins
import sys
from unittest.mock import MagicMock, patch

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


class TestGetGpuStatus:
    """Unit tests for the get_gpu_status() service function."""

    def test_returns_cpu_when_torch_not_importable(self):
        from apps.pages import services

        original_import = builtins.__import__

        def mock_import(name, *args, **kwargs):
            if name == "torch":
                raise ImportError("torch not available")
            return original_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=mock_import):
            # Remove cached torch from sys.modules so the deferred import fires
            sys.modules.pop("torch", None)
            result = services.get_gpu_status()

        assert result["available"] is False
        assert result["device"] == "cpu"
        assert result["device_name"] == "cpu"
        assert result["vram_total_mb"] is None
        assert result["vram_used_mb"] is None
        assert result["vram_free_mb"] is None
        assert "embedding_model" in result

    def test_returns_cuda_fields_when_cuda_available(self):
        from apps.pages import services

        mock_torch = MagicMock()
        mock_torch.cuda.is_available.return_value = True
        mock_torch.cuda.current_device.return_value = 0
        mock_torch.cuda.get_device_name.return_value = "NVIDIA GeForce RTX 3090"
        props = MagicMock()
        props.total_memory = 24576 * 1024 * 1024  # 24 GB in bytes
        mock_torch.cuda.get_device_properties.return_value = props
        mock_torch.cuda.memory_reserved.return_value = 1024 * 1024 * 1024  # 1 GB
        mock_torch.cuda.memory_allocated.return_value = 512 * 1024 * 1024  # 512 MB

        with patch.dict(sys.modules, {"torch": mock_torch}):
            result = services.get_gpu_status()

        assert result["available"] is True
        assert result["device"] == "cuda:0"
        assert result["device_name"] == "NVIDIA GeForce RTX 3090"
        assert result["vram_total_mb"] == 24576
        assert result["vram_used_mb"] == 512
        assert result["vram_free_mb"] == 24576 - 1024  # total - reserved

    def test_returns_mps_fields_when_mps_available(self):
        from apps.pages import services

        mock_torch = MagicMock()
        mock_torch.cuda.is_available.return_value = False
        mock_torch.backends.mps.is_available.return_value = True

        with patch.dict(sys.modules, {"torch": mock_torch}):
            result = services.get_gpu_status()

        assert result["available"] is True
        assert result["device"] == "mps"
        assert result["device_name"] == "Apple Silicon (MPS)"
        assert result["vram_total_mb"] is None
        assert result["vram_used_mb"] is None
        assert result["vram_free_mb"] is None

    def test_returns_cpu_when_no_gpu(self):
        from apps.pages import services

        mock_torch = MagicMock()
        mock_torch.cuda.is_available.return_value = False
        mock_torch.backends.mps.is_available.return_value = False

        with patch.dict(sys.modules, {"torch": mock_torch}):
            result = services.get_gpu_status()

        assert result["available"] is False
        assert result["device"] == "cpu"

    def test_response_has_all_required_keys(self):
        from apps.pages import services

        mock_torch = MagicMock()
        mock_torch.cuda.is_available.return_value = False
        mock_torch.backends.mps.is_available.return_value = False

        with patch.dict(sys.modules, {"torch": mock_torch}):
            result = services.get_gpu_status()

        required_keys = {
            "available",
            "device",
            "device_name",
            "vram_total_mb",
            "vram_used_mb",
            "vram_free_mb",
            "embedding_model",
        }
        assert required_keys == set(result.keys())


@pytest.mark.django_db
class TestGpuStatusEndpoint:
    def test_returns_200(self, client):
        url = reverse("gpu-status")
        response = client.get(url)
        assert response.status_code == 200

    def test_response_has_required_shape(self, client):
        url = reverse("gpu-status")
        response = client.get(url)
        data = response.json()
        required_keys = {
            "available",
            "device",
            "device_name",
            "vram_total_mb",
            "vram_used_mb",
            "vram_free_mb",
            "embedding_model",
        }
        assert required_keys == set(data.keys())

    def test_no_auth_required(self, client):
        """Endpoint must be accessible without authentication."""
        url = reverse("gpu-status")
        response = client.get(url)
        assert response.status_code == 200

