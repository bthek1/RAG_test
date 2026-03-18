# Plan: GPU Support for Embeddings

**Status:** Draft
**Date:** 2026-03-18

---

## Goal

Enable GPU-accelerated inference for the `BAAI/bge-large-en-v1.5` embedding model in the RAG pipeline. If a CUDA GPU is available, use it automatically. If not, gracefully fall back to CPU with no configuration change required. A single optional env var (`EMBEDDING_DEVICE`) allows explicit override.

## Background

The current `get_embedding_model()` in `apps/embeddings/services.py` loads `SentenceTransformer` with no `device` argument. This means:

- If `torch` was installed from the default PyPI index it ships CPU-only, so the model always runs on CPU regardless of available hardware.
- There is no logging to indicate which device is actually in use — silent CPU fallback looks identical to GPU usage.

GPU inference is meaningfully faster for large batch ingestion (hundreds of chunks per document) and marginally faster for single-vector query encoding. Given the healthcare/professional context and the target of running large documents through the pipeline, the improvement is worth enabling.

---

## Phases

### Phase 1 — Auto-detect device with graceful fallback

**File:** `backend/apps/embeddings/services.py`

- [ ] Add `_EMBEDDING_DEVICE = os.environ.get("EMBEDDING_DEVICE", None)` constant below the existing model name constant. `None` tells `SentenceTransformer` to auto-detect (uses CUDA if available, else CPU).
- [ ] Pass `device=_EMBEDDING_DEVICE` to the `SentenceTransformer(...)` constructor in `get_embedding_model()`.
- [ ] After the model loads, log which device was selected:
  ```python
  import logging
  logger = logging.getLogger(__name__)
  logger.info("Embedding model loaded on device: %s", _model_singleton.device)
  ```
- [ ] Update the docstring on `get_embedding_model()` to document the device selection logic.

**Code change (pure addition, no behaviour change on CPU-only installs):**

```python
_EMBEDDING_DEVICE = os.environ.get("EMBEDDING_DEVICE", None)
# None → auto-detect (CUDA if available, else CPU)
# "cuda" / "cuda:0" → force GPU
# "cpu" → force CPU

def get_embedding_model():
    """Lazy-load and cache the SentenceTransformer model.

    Device selection (in priority order):
    1. EMBEDDING_DEVICE env var if set ("cuda", "cuda:0", "mps", "cpu").
    2. CUDA if torch detects a GPU and was installed with CUDA support.
    3. CPU as final fallback (always available).
    """
    global _model_singleton  # noqa: PLW0603
    if _model_singleton is None:
        from sentence_transformers import SentenceTransformer

        _model_singleton = SentenceTransformer(
            _EMBEDDING_MODEL_NAME,
            device=_EMBEDDING_DEVICE,
        )
        logger.info("Embedding model loaded on device: %s", _model_singleton.device)
    return _model_singleton
```

### Phase 2 — Install CUDA-enabled PyTorch

`sentence-transformers` depends on `torch`, but the default PyPI wheel is CPU-only. GPU inference requires the CUDA-enabled wheel from PyTorch's own index.

- [ ] Verify GPU availability: `nvidia-smi`
- [ ] Identify CUDA version: `nvidia-smi | grep "CUDA Version"`
- [ ] Re-install torch with the matching CUDA build:
  ```bash
  # CUDA 12.4 (most common on modern cards)
  cd backend && uv run pip install torch --index-url https://download.pytorch.org/whl/cu124

  # CUDA 11.8 (older cards / older drivers)
  cd backend && uv run pip install torch --index-url https://download.pytorch.org/whl/cu118
  ```
- [ ] Confirm CUDA is detected:
  ```bash
  cd backend && uv run python -c "import torch; print('CUDA:', torch.cuda.is_available(), '|', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'no GPU')"
  ```
- [ ] If on Apple Silicon, no extra install is needed — `mps` backend is included with the standard `torch` wheel. Set `EMBEDDING_DEVICE=mps` in `.env`.

> **Note:** The `torch` CUDA wheel is large (~2 GB). It is installed outside `pyproject.toml` because the correct index URL depends on the host's CUDA version — this is a deployment-time decision, not a dependency declaration. CPU-only installs remain fully functional with no changes.

### Phase 3 — Environment configuration

- [ ] Add `EMBEDDING_DEVICE` to `backend/.env.example` with a comment:
  ```env
  # Optional. Force embedding device: cuda, cuda:0, mps, cpu.
  # Leave unset to auto-detect (uses GPU if available, else CPU).
  # EMBEDDING_DEVICE=cuda
  ```
- [ ] Do **not** set a default value in `.env` — auto-detect is the correct default.

### Phase 4 — Docker GPU access (optional, for containerised Celery workers)

The embedding model runs inside the `celery_worker` container during ingestion. Containers cannot access the host GPU unless the NVIDIA Container Toolkit is installed and the service declares device access.

- [ ] Install NVIDIA Container Toolkit on the Docker host: [https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)
- [ ] Add GPU reservation to `celery_worker` in `docker-compose.yml`:
  ```yaml
  celery_worker:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
  ```
- [ ] Also add to `backend` service if query-time embedding (via `similarity_search`) should use GPU in the web container.
- [ ] Rebuild and restart: `just celery-up`

> **Local dev (no Docker):** GPU access works natively — no container config needed when running `just be-celery` and `just be-dev`.

---

## Testing

### Unit tests

- `get_embedding_model()` returns a model on the expected device when `EMBEDDING_DEVICE` is set.
- `get_embedding_model()` does **not** raise when `EMBEDDING_DEVICE` is unset (auto-detect path).
- `get_embedding_model()` returns the same singleton instance on repeated calls (no re-load).
- Monkeypatch `_model_singleton = None` between test cases to reset singleton state.
- All existing `embed_texts` tests pass unchanged — no new fixture requirement.

### Integration tests

- End-to-end `ingest_document` test with a short document verifies embeddings have correct dimension (`EMBEDDING_DIMENSIONS`) regardless of device.
- `similarity_search` returns results with correct shape after GPU-encoded query vector.

### Manual verification

1. Check Django startup log for `"Embedding model loaded on device: cuda:0"` (or `cpu` on CPU-only host).
2. Run `nvidia-smi dmon -s u` in a separate terminal during a large document ingestion — GPU utilisation should spike.
3. Time a batch ingestion with and without GPU:
   ```bash
   time curl -X POST http://localhost:8005/api/embeddings/documents/ \
     -H "Authorization: Bearer $TOKEN" \
     -F "file=@large_document.pdf"
   ```

---

## Risks & Notes

- **No behaviour change on CPU-only hosts.** Passing `device=None` to `SentenceTransformer` is equivalent to the current deviceless call — the model auto-selects CPU. Existing deployments are unaffected.
- **CUDA version mismatch.** If the wrong `torch` CUDA variant is installed, `torch.cuda.is_available()` returns `False` and the model falls back to CPU silently. The startup log makes this observable.
- **OOM on GPU.** `BAAI/bge-large-en-v1.5` (1024-dim) requires ~1.3 GB VRAM. Very large batches in `embed_texts` may exhaust VRAM. If needed, add a `batch_size` parameter to `model.encode(texts, batch_size=64)` — sentence-transformers handles batching internally.
- **Apple Silicon (MPS).** Set `EMBEDDING_DEVICE=mps` explicitly — auto-detect does not yet reliably prefer MPS in all sentence-transformers versions.
- **Celery worker restarts.** The model singleton lives in the worker process. A worker restart forces a model reload. This is expected behaviour and takes ~10–30 seconds on first call.
- **Phase 4 is optional.** If all processing runs locally (not in Docker), Phase 4 can be skipped entirely.
