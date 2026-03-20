# API Contracts

All endpoints are prefixed with `/api/`. Authentication uses JWT Bearer tokens unless noted as public.

---

## Authentication

### `POST /api/token/`

Obtain a JWT access + refresh token pair.

**Auth:** Public

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "string"
}
```

**Response `200`:**
```json
{
  "access": "<jwt_access_token>",
  "refresh": "<jwt_refresh_token>"
}
```

**Errors:** `401` — invalid credentials

---

### `POST /api/token/refresh/`

Exchange a valid refresh token for a new access token.

**Auth:** Public

**Request body:**
```json
{
  "refresh": "<jwt_refresh_token>"
}
```

**Response `200`:**
```json
{
  "access": "<new_jwt_access_token>"
}
```

**Errors:** `401` — refresh token invalid or expired

---

## Accounts

### `POST /api/accounts/register/`

Create a new user account.

**Auth:** Public

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "string (min 8 chars)"
}
```

**Response `201`:**
```json
{
  "id": "<uuid>",
  "email": "user@example.com"
}
```

**Errors:** `400` — validation error (duplicate email, weak password)

---

### `GET /api/accounts/me/`

Retrieve the authenticated user's profile.

**Auth:** Bearer token required

**Response `200`:**
```json
{
  "id": "<uuid>",
  "email": "user@example.com",
  "first_name": "string",
  "last_name": "string",
  "date_joined": "2026-01-01T00:00:00Z"
}
```

**Errors:** `401` — missing or invalid token

---

### `PATCH /api/accounts/me/`

Update the authenticated user's profile fields.

**Auth:** Bearer token required

**Request body** (all fields optional):
```json
{
  "first_name": "string",
  "last_name": "string",
  "email": "user@example.com"
}
```

**Response `200`:** Updated user object (same shape as `GET /api/accounts/me/`)

**Errors:** `400` — validation error, `401` — unauthorised

---

## Health

### `GET /api/health/`

Service liveness check.

**Auth:** Public

**Response `200`:**
```json
{
  "status": "ok"
}
```

---

### `GET /api/gpu-status/`

Returns the compute device available for embedding inference (CUDA GPU, Apple Silicon MPS, or CPU) along with VRAM usage stats where available.

**Auth:** Public

**Response `200` (GPU present — CUDA):**
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

**Response `200` (Apple Silicon MPS):**
```json
{
  "available": true,
  "device": "mps",
  "device_name": "Apple Silicon (MPS)",
  "vram_total_mb": null,
  "vram_used_mb": null,
  "vram_free_mb": null,
  "embedding_model": "BAAI/bge-large-en-v1.5"
}
```

**Response `200` (CPU only):**
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

**Fields:**

| Field | Type | Description |
|---|---|---|
| `available` | `boolean` | `true` if a CUDA or MPS GPU is active |
| `device` | `string` | PyTorch device string, e.g. `"cuda:0"`, `"mps"`, `"cpu"` |
| `device_name` | `string` | Human-readable device name |
| `vram_total_mb` | `integer \| null` | Total VRAM in MB (CUDA only; `null` for MPS/CPU) |
| `vram_used_mb` | `integer \| null` | Allocated VRAM in MB (CUDA only) |
| `vram_free_mb` | `integer \| null` | Free VRAM in MB (CUDA only; total minus reserved) |
| `embedding_model` | `string` | Value of `EMBEDDING_MODEL` env var |

---

## Embeddings & RAG

All endpoints under `/api/embeddings/` require a Bearer JWT token.

---

### `POST /api/embeddings/documents/`

Ingest a new document — creates the Document record immediately and enqueues chunking and embedding as a background Celery task. Returns `201` with `status: "pending"` before the task completes.

Two variants are supported (mutually exclusive):

**Variant A — JSON text (`Content-Type: application/json`):**
```json
{
  "title": "My Document",
  "content": "Full text of the document...",
  "source": "https://example.com/doc"
}
```
`source` is optional. `content` must be a non-empty string.

**Variant B — PDF upload (`Content-Type: multipart/form-data`):**
```
title=My Document
file=<PDF binary>
source=https://example.com/doc   (optional)
```
The backend extracts plain text from the PDF using `pypdf` and then runs the same chunking → embedding → storage pipeline. Max file size: 50 MB. Only `.pdf` files are accepted.

**Response `201` (both variants):**
```json
{
  "id": "<uuid>",
  "title": "My Document",
  "source": "https://example.com/doc",
  "content": "Full text...",
  "status": "pending",
  "created_at": "2026-03-15T00:00:00Z",
  "updated_at": "2026-03-15T00:00:00Z",
  "chunk_count": 0
}
```

`status` transitions: `pending → processing → done` (or `failed` on error). Poll `GET /api/embeddings/documents/{id}/status/` to track progress.

**Errors:**
- `400` — validation error (missing both `content` and `file`, both provided, file too large, non-PDF file, image-only PDF with no extractable text)
- `401` — unauthorised

---

### `GET /api/embeddings/documents/`

List all ingested documents (without the full content body).

**Response `200`:**
```json
[
  {
    "id": "<uuid>",
    "title": "My Document",
    "source": "https://example.com/doc",
    "status": "done",
    "created_at": "2026-03-15T00:00:00Z",
    "updated_at": "2026-03-15T00:00:00Z",
    "chunk_count": 4
  }
]
```

---

### `GET /api/embeddings/documents/{id}/`

Retrieve a single document including full content, status, and chunk count.

**Response `200`:** Same shape as `POST` response above (includes `status`).

**Errors:** `401`, `404`

---

### `GET /api/embeddings/documents/{id}/status/`

Poll the background processing status of a document.

**Response `200`:**
```json
{
  "id": "<uuid>",
  "status": "processing",
  "chunk_count": 0
}
```

Possible `status` values: `pending`, `processing`, `done`, `failed`.

**Errors:** `401`, `404`

---

### `DELETE /api/embeddings/documents/{id}/`

Delete a document and all its associated chunks (CASCADE).

**Response `204`:** No content.

**Errors:** `401`, `404`

---

### `GET /api/embeddings/documents/{id}/chunks/`

List all chunks for a document, ordered by `chunk_index`.

**Auth:** `Authorization: Bearer <token>` required.

**Response `200`:**
```json
[
  {
    "id": "<uuid>",
    "document": "<document-uuid>",
    "document_title": "My PDF",
    "content": "First chunk of text...",
    "chunk_index": 0,
    "created_at": "2026-03-17T00:00:00Z",
    "distance": null
  }
]
```

**Errors:** `401` — unauthorised, `404` — document not found

---

### `POST /api/embeddings/search/`

Similarity search — embed the query locally and return the top-k most similar chunks ranked by cosine distance.

**Request body:**
```json
{
  "query": "What is retrieval-augmented generation?",
  "top_k": 5
}
```
`top_k` defaults to `5`, max `50`.

**Response `200`:** Array of `Chunk` objects (see **Chunk object** below).

**Errors:** `400` — missing or invalid query, `401`

---

### Chunk object

All endpoints that return chunk data use this shape:

```json
{
  "id": "<uuid>",
  "document": "<document-uuid>",
  "document_title": "My Document",
  "content": "RAG combines a retriever with a language model...",
  "chunk_index": 2,
  "created_at": "2026-03-15T00:00:00Z",
  "distance": 0.08
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Chunk primary key |
| `document` | UUID | Parent document ID |
| `document_title` | string | Title of the parent document |
| `content` | string | Raw chunk text |
| `chunk_index` | integer | Zero-based position within the document |
| `created_at` | ISO 8601 | When the chunk was created |
| `distance` | float \| null | Cosine distance from query (only present in search/RAG results) |

**Errors:** `400` — missing or invalid query, `401`

---

### `POST /api/embeddings/rag/`

Full RAG pipeline: embed the query → retrieve top-k chunks via HNSW → generate a grounded answer with Claude.

**Requires:** `ANTHROPIC_API_KEY` in the environment.

**Request body:**
```json
{
  "query": "What is retrieval-augmented generation?",
  "top_k": 5
}
```
`top_k` defaults to `5`, max `50`.

**Response `200`:**
```json
{
  "answer": "Retrieval-Augmented Generation (RAG) is a technique that...",
  "sources": [
    {
      "chunk_id": "<uuid>",
      "document_title": "My Document",
      "content": "RAG combines a retriever with a language model...",
      "distance": 0.08
    }
  ]
}
```

**Errors:** `400` — missing query, `401` — unauthorised, `500` — `ANTHROPIC_API_KEY` not configured

---

### `GET /api/embeddings/tasks/{task_id}/`

Retrieve the current state of a Celery background task (e.g. after document ingestion).

**Auth:** Bearer token required

**Response `200`:**
```json
{
  "task_id": "<celery-task-uuid>",
  "status": "SUCCESS",
  "result": { "document_id": "<uuid>", "chunk_count": 12 },
  "traceback": null
}
```

Possible `status` values: `PENDING`, `RECEIVED`, `STARTED`, `SUCCESS`, `FAILURE`, `REVOKED`, `RETRY`.

`result` is only populated when `status` is `SUCCESS`; otherwise `null`. `traceback` contains the error traceback string on `FAILURE`.

**Errors:** `401`

---

### `POST /api/embeddings/tasks/{task_id}/revoke/`

Revoke a pending or running Celery task. Sends a SIGTERM to the worker processing it.

**Auth:** Bearer token required

**Request body:** Empty (no body required)

**Response `200`:**
```json
{
  "task_id": "<celery-task-uuid>",
  "revoked": true
}
```

**Errors:** `401`

---

## Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | OK — request succeeded |
| `201` | Created — resource created |
| `400` | Bad Request — validation error |
| `401` | Unauthorised — missing or invalid JWT |
| `403` | Forbidden — authenticated but insufficient permissions |
| `404` | Not Found |
| `500` | Internal Server Error |

---

## Request Headers

All authenticated requests must include:

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

---

## Model Notes

- All primary keys are UUIDs (`uuid4`)
- Timestamps are ISO 8601 in UTC
- `CustomUser` extends Django's `AbstractUser` — `email` is the login identifier (no `username` field)
