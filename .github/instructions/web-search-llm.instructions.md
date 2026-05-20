---
description: "Use when implementing web-search-grounded LLM chat, combining the researcher app (DuckDuckGo search + scraping) with the chat app (Ollama local LLM). Covers architecture, endpoint design, context injection, streaming, and performance considerations."
applyTo: "apps/researcher/**,apps/chat/**"
---

# Web Search + Local LLM (Ollama) Integration

## Overview

This project has two independent backend apps that can be combined to build a **web-grounded chat** feature:

| App                | Package                           | Purpose                                         |
| ------------------ | --------------------------------- | ----------------------------------------------- |
| `apps/chat/`       | `httpx`, Ollama REST API          | Local LLM via Ollama (blocking + SSE streaming) |
| `apps/researcher/` | `ddgs`, `httpx`, `beautifulsoup4` | DuckDuckGo web search + full-page text scraping |

The pattern: **search → scrape → inject as context → LLM generates answer with citations**.

---

## How Each App Works

### Chat App (`apps/chat/`)

- `client.py` — `OllamaClient`: thin `httpx` wrapper around the Ollama REST API
  - `chat(model, messages)` → blocking, returns full reply `str`
  - `chat_stream(model, messages)` → generator, yields NDJSON token dicts
- `services.py` — module-level singleton `_client = OllamaClient()`
  - `chat(messages, model)` → `str`
  - `stream_chat(messages, model)` → token generator
- Configured via env vars: `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_TIMEOUT`
- Messages format: `[{"role": "system"|"user"|"assistant", "content": "..."}]`

### Researcher App (`apps/researcher/`)

- `search.py` — `DDGClient`: wraps `ddgs.DDGS`, **no API key needed**
  - `text(query, max_results)` → `[{title, href, body, type}]`
  - `news / videos / images` variants available
- `scraper.py` — `Scraper`: fetches URL with `httpx`, strips HTML boilerplate via BeautifulSoup
  - `scrape(url, max_chars=8000)` → cleaned plain text
- `services.py` — `run_search(query, max_results, type, sort)`
  - Calls DDGClient then **immediately scrapes each result** (synchronous, blocks per result)
  - Returns `[{type, title, url, snippet, scraped_text, ...}]`

---

## Integration Pattern: Web-Grounded Chat

### Step-by-step flow

```
1. Receive {query, messages, model, max_results}
2. researcher.services.run_search(query, max_results=3) → results[]
3. Build a context block from scraped_text:
       "Web sources:\n\n[1] {title} ({url})\n{scraped_text[:2000]}\n\n[2] ..."
4. Prepend a system message:
       {"role": "system", "content": "Answer using ONLY the web sources below.\n\n{context}"}
5. Append the user query:
       {"role": "user", "content": query}
6. chat.services.chat(messages, model) OR stream_chat for SSE
7. Return {reply, sources: [{title, url, snippet}]}
```

### Example service function

```python
# apps/researcher/services.py  (or a new apps/researcher_chat/services.py)
from apps.chat import services as chat_services
from apps.researcher.services import run_search


def web_search_chat(query: str, model: str, max_results: int = 3) -> dict:
    results = run_search(query, max_results=max_results, type="web")

    context_parts = []
    for i, r in enumerate(results, start=1):
        text = (r.get("scraped_text") or r.get("snippet", ""))[:2000]
        context_parts.append(f"[{i}] {r['title']} ({r['url']})\n{text}")

    context = "\n\n".join(context_parts)
    messages = [
        {
            "role": "system",
            "content": (
                "You are a helpful assistant. Answer the user's question using "
                "only the web sources provided below. Cite sources by number.\n\n"
                f"Web sources:\n\n{context}"
            ),
        },
        {"role": "user", "content": query},
    ]

    reply = chat_services.chat(messages, model)
    return {
        "reply": reply,
        "sources": [{"title": r["title"], "url": r["url"], "snippet": r.get("snippet", "")} for r in results],
    }
```

---

## API Endpoint Design

### New endpoint: `POST /api/researcher/chat/`

```python
# apps/researcher/views.py
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from apps.researcher.services import web_search_chat  # function above


class WebSearchChatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        query = request.data.get("query", "")
        model = request.data.get("model", settings.OLLAMA_MODEL)
        max_results = int(request.data.get("max_results", 3))

        result = web_search_chat(query, model, max_results)
        return Response(result)
```

**Request body:**

```json
{
  "query": "What is the current state of quantum computing?",
  "model": "llama3.2",
  "max_results": 3
}
```

**Response:**

```json
{
  "reply": "Based on source [1]...",
  "sources": [{ "title": "...", "url": "https://...", "snippet": "..." }]
}
```

---

## Streaming Variant

For SSE streaming, yield search+scrape results first, then stream LLM tokens:

```python
from django.http import StreamingHttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from apps.researcher.services import run_search
from apps.chat.services import stream_chat
import json


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def web_search_chat_stream(request):
    query = request.data.get("query", "")
    model = request.data.get("model", settings.OLLAMA_MODEL)
    max_results = int(request.data.get("max_results", 3))

    def event_stream():
        results = run_search(query, max_results=max_results, type="web")

        # Emit sources immediately so the client can show them
        yield f"data: {json.dumps({'type': 'sources', 'sources': [{'title': r['title'], 'url': r['url']} for r in results]})}\n\n"

        context_parts = [
            f"[{i}] {r['title']} ({r['url']})\n{(r.get('scraped_text') or r.get('snippet', ''))[:2000]}"
            for i, r in enumerate(results, start=1)
        ]
        context = "\n\n".join(context_parts)
        messages = [
            {"role": "system", "content": f"Answer using these web sources:\n\n{context}"},
            {"role": "user", "content": query},
        ]

        for chunk in stream_chat(messages, model):
            token = chunk.get("message", {}).get("content", "")
            if token:
                yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingHttpResponse(event_stream(), content_type="text/event-stream")
```

---

## Performance Considerations

| Issue                 | Impact                                                      | Mitigation                                                                          |
| --------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Synchronous scraping  | 3 results = 3 blocking HTTP calls before LLM starts         | Reduce `max_results` (≤ 3); use `httpx.AsyncClient` in async view                   |
| Context length limits | Too much scraped text fills the LLM context window          | Cap `scraped_text` at **2000 chars** per source (not 8000)                          |
| Ollama cold start     | First request after idle is slow (model loads into GPU/CPU) | Warm up with `/api/chat/status/`; keep model loaded via Ollama's `keep_alive` param |
| Search rate limiting  | DuckDuckGo may throttle repeated queries                    | Cache results in Django's cache framework; add retry backoff in `DDGClient`         |

---

## Environment Variables

Add these to `backend/.env`:

```env
# Ollama — must be running separately (not in Docker Compose by default)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2          # or mistral, qwen2.5, etc.
OLLAMA_TIMEOUT=120             # seconds; increase for large models
```

Check Ollama is running:

```bash
curl http://localhost:11434/api/tags      # list available models
ollama run llama3.2                       # pull and start a model
```

---

## Adding the Route

```python
# apps/researcher/urls.py
from django.urls import path
from apps.researcher.views import SearchView, WebSearchChatView, web_search_chat_stream

urlpatterns = [
    path("search/", SearchView.as_view()),
    path("chat/", WebSearchChatView.as_view()),           # blocking
    path("chat/stream/", web_search_chat_stream),         # SSE streaming
]
```

---

## Testing

### Unit test: context builder

```python
# apps/researcher/tests/test_web_search_chat.py
import pytest
from unittest.mock import patch


@patch("apps.chat.services.chat", return_value="Mocked reply")
@patch("apps.researcher.services.run_search", return_value=[
    {"title": "Test", "url": "https://test.com", "snippet": "snippet", "scraped_text": "full text"},
])
def test_web_search_chat_returns_reply_and_sources(mock_search, mock_chat):
    from apps.researcher.services import web_search_chat
    result = web_search_chat("What is AI?", model="llama3.2", max_results=1)
    assert result["reply"] == "Mocked reply"
    assert result["sources"][0]["url"] == "https://test.com"
    mock_chat.assert_called_once()
    # Verify context was injected into messages
    messages = mock_chat.call_args[0][0]
    system_msg = next(m for m in messages if m["role"] == "system")
    assert "full text" in system_msg["content"]
```

### Integration test: view

```python
@pytest.mark.django_db
def test_web_search_chat_view(auth_client):
    with patch("apps.researcher.views.web_search_chat", return_value={"reply": "ok", "sources": []}):
        response = auth_client.post("/api/researcher/chat/", {"query": "test"}, format="json")
    assert response.status_code == 200
    assert response.data["reply"] == "ok"
```

### Manual verification

```bash
# 1. Start Ollama
ollama serve

# 2. Pull a model
ollama pull llama3.2

# 3. Get JWT token
TOKEN=$(curl -s -X POST http://localhost:8004/api/token/ \
  -H "Content-Type: application/json" \
  -d '{"email":"user@test.com","password":"pass"}' | jq -r .access)

# 4. Blocking web search chat
curl -X POST http://localhost:8004/api/researcher/chat/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "latest AI news", "max_results": 3}'

# 5. Streaming web search chat
curl -N -X POST http://localhost:8004/api/researcher/chat/stream/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "latest AI news", "max_results": 3}'
```

---

## Architecture Decision Notes

- **No Celery for basic web search chat** — acceptable for interactive use with `max_results ≤ 3`
- **Use Celery** if scraping must be parallelized or results cached for reuse across requests
- **Never import `chat` models from `researcher`** — keep apps decoupled; share only through service function calls
- **No API key required** for DuckDuckGo search — but respect rate limits in production
- Business logic belongs in `services.py`, not in views — follow the project convention
