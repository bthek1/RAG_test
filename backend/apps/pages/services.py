import logging
import os

logger = logging.getLogger(__name__)


def get_gpu_status() -> dict:
    """Return GPU availability and stats without requiring torch to be imported at
    module level (import is deferred so CPU-only hosts pay no startup cost).

    Returns a dict with the shape:
    {
        "available": bool,
        "device": str,           # e.g. "cuda:0", "cpu", "mps"
        "device_name": str,      # e.g. "NVIDIA GeForce RTX 3090" or "cpu"
        "vram_total_mb": int | None,
        "vram_used_mb": int | None,
        "vram_free_mb": int | None,
        "embedding_model": str,  # value of EMBEDDING_MODEL env var
    }
    """
    embedding_model = os.environ.get("EMBEDDING_MODEL", "BAAI/bge-large-en-v1.5")

    try:
        import torch

        cuda_available = torch.cuda.is_available()

        if cuda_available:
            idx = torch.cuda.current_device()
            device_name = torch.cuda.get_device_name(idx)
            device_str = f"cuda:{idx}"
            props = torch.cuda.get_device_properties(idx)
            # torch reports in bytes
            vram_total = props.total_memory // (1024 * 1024)
            vram_reserved = torch.cuda.memory_reserved(idx) // (1024 * 1024)
            vram_used = torch.cuda.memory_allocated(idx) // (1024 * 1024)
            vram_free = vram_total - vram_reserved
            return {
                "available": True,
                "device": device_str,
                "device_name": device_name,
                "vram_total_mb": vram_total,
                "vram_used_mb": vram_used,
                "vram_free_mb": vram_free,
                "embedding_model": embedding_model,
            }

        # MPS (Apple Silicon) check
        mps_available = (
            getattr(torch.backends, "mps", None) and torch.backends.mps.is_available()
        )
        if mps_available:
            return {
                "available": True,
                "device": "mps",
                "device_name": "Apple Silicon (MPS)",
                "vram_total_mb": None,
                "vram_used_mb": None,
                "vram_free_mb": None,
                "embedding_model": embedding_model,
            }

    except ImportError:
        logger.warning("torch not importable — GPU check skipped")

    return {
        "available": False,
        "device": "cpu",
        "device_name": "cpu",
        "vram_total_mb": None,
        "vram_used_mb": None,
        "vram_free_mb": None,
        "embedding_model": embedding_model,
    }
