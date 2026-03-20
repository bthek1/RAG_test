# Plan: GPU Status Indicator in Topbar

**Status:** In Progress
**Date:** 2026-03-20

---

## Goal

Add a GPU availability indicator to the application topbar — styled consistently with the existing "API Connected" indicator — that shows whether a CUDA/MPS GPU is available for embedding inference. Hovering over it reveals a details tooltip with device name, VRAM usage, model name, and detected device string.

## Background

The embedding pipeline (`apps/embeddings/services.py`) already auto-detects the compute device via the `EMBEDDING_DEVICE` env var and `SentenceTransformer`. The frontend has no visibility into whether inference is running on GPU or CPU, which makes it hard to diagnose slow ingestion or confirm that GPU support is active.

The existing topbar (`frontend/src/components/layout/Navbar.tsx`) already contains an API health indicator using a `Tooltip`-wrapped coloured dot + label powered by the `useHealth()` hook and TanStack Query. The GPU indicator follows the exact same pattern.

---

## Current State

### Backend

| File | Relevant content |
|---|---|
| `apps/pages/views.py` | Single `health_check` view → `GET /api/health/` returns `{"status": "ok"}` |
| `apps/pages/urls.py` | Only `path("health/", health_check)` |
| `apps/embeddings/services.py` | `_EMBEDDING_DEVICE`, `_EMBEDDING_MODEL_NAME`, `get_embedding_model()` singleton |
| `core/urls.py` | `api/` → pages.urls, `api/embeddings/` → embeddings.urls |

No GPU/device endpoint exists yet.

### Frontend

| File | Relevant content |
|---|---|
| `src/components/layout/Navbar.tsx` | API status indicator using `useHealth()` + `Tooltip` |
| `src/api/health.ts` | `getHealth()` → `GET /api/health/` |
| `src/api/queryKeys.ts` | `health: ["health"]` key — no GPU keys |
| `src/hooks/useHealth.ts` | `useQuery` wrapper for `getHealth()` |

---

## Phases

### Phase 1 — Backend: GPU status endpoint

**Goal:** Expose a new `GET /api/gpu-status/` endpoint under the pages app that returns GPU info.

#### 1.1 — Add `get_gpu_status()` service function to `apps/pages/`

Create `apps/pages/services.py`:

```python
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
        mps_available = getattr(torch.backends, "mps", None) and torch.backends.mps.is_available()
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
```

#### 1.2 — Add view to `apps/pages/views.py`

```python
from .services import get_gpu_status

@api_view(["GET"])
@permission_classes([AllowAny])
def gpu_status(request):
    return Response(get_gpu_status())
```

#### 1.3 — Register URL in `apps/pages/urls.py`

```python
path("gpu-status/", gpu_status, name="gpu-status"),
```

New route: `GET /api/gpu-status/`

**Response example (GPU present):**
```json
{
  "available": true,
  "device": "cuda:0",
  "device_name": "NVIDIA GeForce RTX 3090",
  "vram_total_mb": 24576,
  "vram_used_mb": 1340,
  "vram_free_mb": 23236,
  "embedding_model": "BAAI/bge-large-en-v1.5"
}
```

**Response example (CPU only):**
```json
{
  "available": false,
  "device": "cpu",
  "device_name": "cpu",
  "vram_total_mb": null,
  "vram_used_mb": null,
  "vram_free_mb": null,
  "embedding_model": "BAAI/bge-large-en-v1.5"
}
```

---

### Phase 2 — Frontend: types, API function, query key, hook

#### 2.1 — Add `GpuStatus` type to `src/types/`

In `src/types/health.ts` (create if not exists) or a new `src/types/gpu.ts`:

```ts
export interface GpuStatus {
  available: boolean;
  device: string;
  device_name: string;
  vram_total_mb: number | null;
  vram_used_mb: number | null;
  vram_free_mb: number | null;
  embedding_model: string;
}
```

#### 2.2 — Add `getGpuStatus()` to `src/api/health.ts`

```ts
import type { GpuStatus } from "@/types/gpu";

export async function getGpuStatus(): Promise<GpuStatus> {
  const { data } = await apiClient.get<GpuStatus>("/api/gpu-status/");
  return data;
}
```

#### 2.3 — Add query key to `src/api/queryKeys.ts`

```ts
gpuStatus: ["gpu-status"] as const,
```

#### 2.4 — Create `src/hooks/useGpuStatus.ts`

```ts
import { useQuery } from "@tanstack/react-query";
import { getGpuStatus } from "@/api/health";
import { queryKeys } from "@/api/queryKeys";

export function useGpuStatus() {
  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.gpuStatus,
    queryFn: getGpuStatus,
    refetchInterval: 30_000,   // refresh every 30 s
    retry: 1,
    staleTime: 15_000,
  });

  return {
    gpuStatus: data,
    isAvailable: data?.available ?? false,
    isPending,
    isError,
  };
}
```

---

### Phase 3 — Frontend: `GpuStatusIndicator` component

Create `src/components/layout/GpuStatusIndicator.tsx`:

```tsx
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useGpuStatus } from "@/hooks/useGpuStatus";

function formatVram(mb: number | null): string {
  if (mb === null) return "—";
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

export function GpuStatusIndicator() {
  const { gpuStatus, isAvailable, isPending, isError } = useGpuStatus();

  const dotClass = isPending
    ? "bg-yellow-400"
    : isError
      ? "bg-red-500"
      : isAvailable
        ? "bg-green-500"
        : "bg-zinc-400";

  const label = isPending
    ? "Checking…"
    : isError
      ? "GPU unknown"
      : isAvailable
        ? "GPU active"
        : "CPU only";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 rounded-md px-2 py-1 cursor-default">
          <span className={`h-2 w-2 rounded-full ${dotClass}`} />
          <span className="hidden text-xs text-muted-foreground sm:block">
            {label}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="space-y-1 text-xs">
        {isPending && <p>Checking GPU availability…</p>}
        {isError && <p>Could not retrieve GPU status from the backend.</p>}
        {!isPending && !isError && gpuStatus && (
          <>
            <p className="font-semibold">
              {gpuStatus.available ? "GPU Available" : "No GPU — Running on CPU"}
            </p>
            <p>Device: <span className="font-mono">{gpuStatus.device}</span></p>
            <p>Model: <span className="font-mono">{gpuStatus.device_name}</span></p>
            <p>Embedding model: <span className="font-mono">{gpuStatus.embedding_model}</span></p>
            {gpuStatus.available && gpuStatus.vram_total_mb !== null && (
              <>
                <hr className="border-border my-1" />
                <p>VRAM total: {formatVram(gpuStatus.vram_total_mb)}</p>
                <p>VRAM used: {formatVram(gpuStatus.vram_used_mb)}</p>
                <p>VRAM free: {formatVram(gpuStatus.vram_free_mb)}</p>
              </>
            )}
            {gpuStatus.available && gpuStatus.vram_total_mb === null && (
              <p className="text-muted-foreground">VRAM stats not available (MPS)</p>
            )}
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
```

**Colour mapping:**

| State | Dot colour | Label |
|---|---|---|
| Loading | Yellow | Checking… |
| Error (can't reach endpoint) | Red | GPU unknown |
| GPU available (CUDA/MPS) | Green | GPU active |
| CPU only | Zinc/grey | CPU only |

---

### Phase 4 — Wire `GpuStatusIndicator` into `Navbar.tsx`

In `src/components/layout/Navbar.tsx`, import and place `<GpuStatusIndicator />` in the status area next to the existing API indicator:

```tsx
import { GpuStatusIndicator } from "./GpuStatusIndicator";

// Inside the navbar right-side flex container, after the API indicator:
<GpuStatusIndicator />
```

The two indicators sit visually adjacent, giving the operator a quick overview of both backend connectivity and compute availability at a glance.

---

## Testing

### Backend unit tests

- `get_gpu_status()` returns `available: False` when `torch` is not importable (monkeypatch `builtins.__import__`).
- `get_gpu_status()` returns `available: True` with CUDA fields populated when `torch.cuda.is_available()` is monkeypatched to `True`.
- `get_gpu_status()` returns MPS fields when CUDA is not available but `torch.backends.mps.is_available()` is `True`.
- `GET /api/gpu-status/` returns HTTP 200 with correct shape (no auth required).
- Response shape includes all required keys: `available`, `device`, `device_name`, `vram_total_mb`, `vram_used_mb`, `vram_free_mb`, `embedding_model`.

### Frontend unit tests

- `useGpuStatus()` hook: `isAvailable` is `false` when `data.available` is `false`.
- `useGpuStatus()` hook: `isAvailable` is `true` when `data.available` is `true`.
- `GpuStatusIndicator` renders green dot + "GPU active" label when `available: true`.
- `GpuStatusIndicator` renders grey dot + "CPU only" label when `available: false`.
- `GpuStatusIndicator` renders yellow dot + "Checking…" when `isPending`.
- `GpuStatusIndicator` renders red dot + "GPU unknown" when `isError`.
- Tooltip content includes device, model name, and VRAM stats (for GPU case).
- Tooltip content omits VRAM section for CPU case.
- Mock `getGpuStatus` at module level — no real HTTP calls.

### Manual verification steps

1. Start backend: `just be-dev`
2. Curl: `curl http://localhost:8005/api/gpu-status/` — confirm JSON shape.
3. Start frontend: `just fe-dev`
4. Load dashboard — should see GPU indicator next to API Connected in topbar.
5. Hover GPU indicator — confirm tooltip shows device/VRAM info.
6. On a CPU-only machine: dot should be grey, tooltip shows "No GPU — Running on CPU".
7. On a CUDA machine: dot should be green, tooltip shows GPU name and VRAM figures.

---

## File Changelist

| File | Change |
|---|---|
| `backend/apps/pages/services.py` | **Create** — `get_gpu_status()` function |
| `backend/apps/pages/views.py` | **Edit** — add `gpu_status` view |
| `backend/apps/pages/urls.py` | **Edit** — add `gpu-status/` route |
| `backend/apps/pages/tests.py` | **Edit** — add GPU status endpoint tests |
| `frontend/src/types/gpu.ts` | **Create** — `GpuStatus` interface |
| `frontend/src/api/health.ts` | **Edit** — add `getGpuStatus()` |
| `frontend/src/api/queryKeys.ts` | **Edit** — add `gpuStatus` key |
| `frontend/src/hooks/useGpuStatus.ts` | **Create** — TanStack Query hook |
| `frontend/src/components/layout/GpuStatusIndicator.tsx` | **Create** — indicator component |
| `frontend/src/components/layout/Navbar.tsx` | **Edit** — mount `<GpuStatusIndicator />` |
| `docs/standards/api-contracts.md` | **Edit** — document `GET /api/gpu-status/` |

---

## Risks & Notes

- **No auth on `/api/gpu-status/`**: The endpoint uses `AllowAny` like the existing health check. GPU availability is non-sensitive diagnostic information. If this changes, add `IsAuthenticated`.
- **Import cost**: `import torch` is deferred inside `get_gpu_status()`. The view is only called when polled, not at startup, so there is no added startup cost on CPU-only hosts.
- **30-second refetch interval**: VRAM usage changes during ingestion. 30 s balances responsiveness against request frequency. Adjust via hook if needed.
- **MPS VRAM stats**: Apple Silicon unified memory tracking via `torch` is unreliable; VRAM fields are returned as `null` for MPS and the tooltip handles this case gracefully.
- **`torch` not installed**: If `torch` is not installed at all (not a scenario in this project, but possible in test environments), the `ImportError` branch returns CPU-only status without 500-ing.
- **API contracts doc**: `GET /api/gpu-status/` must be added to `docs/standards/api-contracts.md` alongside the change.
