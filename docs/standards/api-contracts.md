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

## Embeddings & RAG

All endpoints under `/api/embeddings/` require a Bearer JWT token.

---

### `POST /api/embeddings/documents/`

Ingest a new document — triggers chunking and local embedding. All chunk vectors are stored in Postgres via pgvector.

**Request body:**
```json
{
  "title": "My Document",
  "content": "Full text of the document...",
  "source": "https://example.com/doc"
}
```
`source` is optional (URL or file path for attribution, not fetched).

**Response `201`:**
```json
{
  "id": "<uuid>",
  "title": "My Document",
  "source": "https://example.com/doc",
  "content": "Full text...",
  "created_at": "2026-03-15T00:00:00Z",
  "updated_at": "2026-03-15T00:00:00Z",
  "chunk_count": 4
}
```

**Errors:** `400` — validation error, `401` — unauthorised

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
    "created_at": "2026-03-15T00:00:00Z",
    "updated_at": "2026-03-15T00:00:00Z",
    "chunk_count": 4
  }
]
```

---

### `GET /api/embeddings/documents/{id}/`

Retrieve a single document including full content and chunk count.

**Response `200`:** Same shape as `POST` response above.

**Errors:** `401`, `404`

---

### `DELETE /api/embeddings/documents/{id}/`

Delete a document and all its associated chunks (CASCADE).

**Response `204`:** No content.

**Errors:** `401`, `404`

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

**Response `200`:**
```json
[
  {
    "id": "<uuid>",
    "document": "<document-uuid>",
    "content": "RAG combines a retriever with a language model...",
    "chunk_index": 2,
    "created_at": "2026-03-15T00:00:00Z",
    "distance": 0.08
  }
]
```

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
