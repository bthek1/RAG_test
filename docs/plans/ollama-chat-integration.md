# Plan: Ollama Chat Integration

**Status:** Complete
**Date:** 2026-03-25

---

## Goal

Add a full-featured, streaming-capable chat interface backed by the locally-running
Ollama instance. The UI will closely resemble ChatGPT / Claude.ai — a persistent
conversation sidebar, token-by-token streaming, model switching, and markdown
rendering — while reusing the project's existing DRF backend conventions and React
frontend stack.

---

## Background

### Ollama Instance

Ollama is already running on the host at **`http://localhost:11434`** (loopback only).

#### Available Models

| Model | Base | Parameters | Quantization | Size | Context |
|---|---|---|---|---|---|
| `analysis-assistant:latest` | qwen2.5 (Qwen2 family) | 3.1B | Q4\_K\_M | ~1.93 GB | 4096 tokens |
| `qwen2.5:3b` | qwen2.5 (Qwen2 family) | 3.1B | Q4\_K\_M | ~1.93 GB | (default) |

#### `analysis-assistant` — What Makes It Special

- **Custom system prompt:** `"You are a helpful assistant specialised in analysis and
  summarisation. When asked to analyse, identify key themes, patterns, and insights.
  When asked to summarise, be concise yet comprehensive. Always structure your
  responses clearly."`
- **Temperature:** 0.4 (deterministic, fact-focused)
- **Context window:** 4096 tokens
- **Chat template:** ChatML (`<|im_start|>` / `<|im_end|>`)
- **Tool/function calling:** Supported via `<tool_call>` XML tags
- **Use case:** Analysis, summarisation, structured output — ideal as the _default_ model

`qwen2.5:3b` is the same base weights with no system prompt override — useful for
raw / general-purpose prompting.

#### Ollama REST API (quick ref)

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/version` | Health + version |
| `GET` | `/api/tags` | List downloaded models |
| `POST` | `/api/chat` | Multi-turn chat (stream or blocking) |
| `POST` | `/api/generate` | Single-turn completion |
| `POST` | `/api/show` | Model details / modelfile |

The `/api/chat` endpoint accepts `stream: true` and returns NDJSON
(newline-delimited JSON chunks), one per token.

### Current Stack State

- No Ollama integration exists — the generation layer uses Anthropic Claude only.
- Embeddings are already 100% local (sentence-transformers).
- The existing `apps/embeddings/` app owns the RAG pipeline; the new `apps/chat/`
  app will be a **standalone chat app**, intentionally decoupled from RAG.

---

## Architecture

```
Browser (React)
    │  POST /api/chat/           (TanStack Query useMutation — blocking)
    │  POST /api/chat/stream/    (fetch ReadableStream — streaming SSE)
    ▼
Django + DRF  apps/chat/
    │  OllamaClient → httpx (sync) / httpx.AsyncClient (streaming)
    ▼
Ollama  localhost:11434
    └─ analysis-assistant  (default)
    └─ qwen2.5:3b
```

No Celery tasks needed — Ollama responds in <2 s for the first token at 3B / Q4.
Long streaming responses are served via `StreamingHttpResponse`.

---

## Phases

### Phase 1 — Backend: Ollama Client + Chat Endpoints

#### 1.1 Django settings

- [ ] Add to `core/settings/base.py`:
  ```python
  OLLAMA_BASE_URL = env("OLLAMA_BASE_URL", default="http://localhost:11434")
  OLLAMA_MODEL    = env("OLLAMA_MODEL",    default="analysis-assistant")
  OLLAMA_TIMEOUT  = env.int("OLLAMA_TIMEOUT", default=120)
  ```
- [ ] Add to `backend/.env.example`:
  ```dotenv
  OLLAMA_BASE_URL=http://localhost:11434
  OLLAMA_MODEL=analysis-assistant
  OLLAMA_TIMEOUT=120
  ```

#### 1.2 New Django app — `apps/chat/`

Files to create:

```
apps/chat/
├── __init__.py
├── apps.py           # ChatConfig, label="chat"
├── client.py         # OllamaClient — thin wrapper around httpx
├── serializers.py    # ChatMessageSerializer, ChatRequestSerializer
├── services.py       # build_messages(), list_models(), chat(), stream_chat()
├── views.py          # ChatView (POST /api/chat/), ChatStreamView, ModelListView
├── urls.py           # urlpatterns
└── tests/
    ├── __init__.py
    ├── test_client.py
    ├── test_services.py
    └── test_views.py
```

#### 1.3 `apps/chat/client.py`

```python
import httpx
from django.conf import settings


class OllamaClient:
    """Minimal synchronous httpx client for the Ollama REST API."""

    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL
        self.timeout  = settings.OLLAMA_TIMEOUT

    def list_models(self) -> list[dict]:
        with httpx.Client(timeout=10) as client:
            r = client.get(f"{self.base_url}/api/tags")
            r.raise_for_status()
            return r.json().get("models", [])

    def chat(self, model: str, messages: list[dict]) -> dict:
        payload = {"model": model, "messages": messages, "stream": False}
        with httpx.Client(timeout=self.timeout) as client:
            r = client.post(f"{self.base_url}/api/chat", json=payload)
            r.raise_for_status()
            return r.json()

    def chat_stream(self, model: str, messages: list[dict]):
        """Yields raw response dicts, one per NDJSON line."""
        payload = {"model": model, "messages": messages, "stream": True}
        with httpx.Client(timeout=self.timeout) as client:
            with client.stream("POST", f"{self.base_url}/api/chat", json=payload) as r:
                r.raise_for_status()
                for line in r.iter_lines():
                    if line:
                        import json
                        yield json.loads(line)
```

#### 1.4 `apps/chat/serializers.py`

```python
from rest_framework import serializers

class ChatMessageSerializer(serializers.Serializer):
    role    = serializers.ChoiceField(choices=["user", "assistant", "system"])
    content = serializers.CharField()

class ChatRequestSerializer(serializers.Serializer):
    messages = ChatMessageSerializer(many=True)
    model    = serializers.CharField(required=False)  # defaults to settings value
```

#### 1.5 `apps/chat/services.py`

```python
from django.conf import settings
from .client import OllamaClient

_client = OllamaClient()

def list_models() -> list[dict]:
    return _client.list_models()

def chat(messages: list[dict], model: str | None = None) -> str:
    model = model or settings.OLLAMA_MODEL
    response = _client.chat(model, messages)
    return response["message"]["content"]

def stream_chat(messages: list[dict], model: str | None = None):
    """Yields text tokens for SSE delivery."""
    model = model or settings.OLLAMA_MODEL
    for chunk in _client.chat_stream(model, messages):
        token = chunk.get("message", {}).get("content", "")
        done  = chunk.get("done", False)
        if token:
            yield token
        if done:
            break
```

#### 1.6 `apps/chat/views.py`

Three endpoints:

| View | Method | URL | Auth | Description |
|---|---|---|---|---|
| `ModelListView` | GET | `/api/chat/models/` | `IsAuthenticated` | Return available Ollama models |
| `ChatView` | POST | `/api/chat/` | `IsAuthenticated` | Blocking chat — returns full reply |
| `ChatStreamView` | POST | `/api/chat/stream/` | `IsAuthenticated` | Streaming SSE — token-by-token |

```python
# ChatView
class ChatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reply = chat(
            serializer.validated_data["messages"],
            serializer.validated_data.get("model"),
        )
        return Response({"reply": reply})

# ChatStreamView
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def chat_stream_view(request):
    serializer = ChatRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    def event_stream():
        for token in stream_chat(
            serializer.validated_data["messages"],
            serializer.validated_data.get("model"),
        ):
            import json
            yield f"data: {json.dumps({'token': token})}\n\n"
        yield "data: [DONE]\n\n"

    response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
    response["Cache-Control"]    = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response
```

#### 1.7 Register the app

- [ ] Add `"apps.chat"` to `INSTALLED_APPS` in `core/settings/base.py`
- [ ] Add `path("api/chat/", include("apps.chat.urls"))` to `core/urls.py`

#### 1.8 API contract doc update

- [ ] Append to `docs/standards/api-contracts.md`:
  - `GET /api/chat/models/`
  - `POST /api/chat/`
  - `POST /api/chat/stream/`

---

### Phase 2 — Frontend: Chat UI

#### 2.1 Types — `src/types/chat.ts`

```ts
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
}

export interface ChatResponse {
  reply: string;
}

export interface OllamaModel {
  name: string;
  model: string;
  size: number;
  details: {
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}
```

#### 2.2 API layer — `src/api/chat.ts`

```ts
import apiClient from "./client";
import type { ChatRequest, ChatResponse, OllamaModel } from "@/types/chat";

export async function listModels(): Promise<OllamaModel[]> {
  const { data } = await apiClient.get<{ models: OllamaModel[] }>("/api/chat/models/");
  return data.models;
}

export async function sendChat(payload: ChatRequest): Promise<ChatResponse> {
  const { data } = await apiClient.post<ChatResponse>("/api/chat/", payload);
  return data;
}
```

Streaming is handled outside Axios using the native `fetch` API and
`ReadableStream` — see hook below.

#### 2.3 Query keys — update `src/api/queryKeys.ts`

```ts
chat: {
  models: ["chat", "models"] as const,
},
```

#### 2.4 Zustand store — `src/store/chat.ts`

```ts
interface ChatConversation {
  id: string;        // nanoid
  title: string;     // first user message (truncated)
  model: string;
  messages: ChatMessage[];
  createdAt: string; // ISO timestamp
}

interface ChatState {
  conversations: ChatConversation[];
  activeId: string | null;
  selectedModel: string;
  // actions
  newConversation: (model: string) => string;
  setActive: (id: string) => void;
  addMessage: (conversationId: string, msg: ChatMessage) => void;
  appendToken: (conversationId: string, token: string) => void;
  deleteConversation: (id: string) => void;
  setModel: (model: string) => void;
}
```

Use `immer` middleware. Conversations live only in Zustand (no backend persistence
in Phase 2 — see Phase 3 for optional DB persistence).

#### 2.5 Custom hooks — `src/hooks/useOllamaChat.ts`

```ts
// Non-streaming mutation (fallback / testing)
export function useSendChat();

// Streaming chat — returns { streaming, streamingContent, send }
export function useStreamingChat();
```

`useStreamingChat` uses `fetch` with `ReadableStream`:
1. `POST /api/chat/stream/` with `{ messages, model }` and the JWT `Authorization` header
2. Parse `data: { token }` SSE lines
3. Call `chatStore.appendToken()` per token
4. Finalise conversation on `data: [DONE]`

#### 2.6 Route — `src/routes/chat.tsx`

New file-based route at `/chat`. Full-page layout, not nested under `/rag`.

```
/chat
  ├── Sidebar panel  ← conversation list + New Chat button + model selector
  └── Main panel     ← message thread + input box
```

#### 2.7 Components (all in `src/components/chat/`)

| Component | Purpose |
|---|---|
| `ChatLayout.tsx` | Two-pane layout (sidebar + main), responsive |
| `ConversationSidebar.tsx` | Lists conversations, active highlight, delete button, New Chat |
| `ModelSelector.tsx` | `<select>` / `<DropdownMenu>` populated from `GET /api/chat/models/` |
| `MessageThread.tsx` | Scrollable list of `ChatBubble` items + auto-scroll to bottom |
| `ChatBubble.tsx` | User bubble (right) vs assistant bubble (left), timestamps, copy button |
| `MarkdownRenderer.tsx` | Renders assistant markdown via `react-markdown` + `remark-gfm` |
| `StreamingIndicator.tsx` | Blinking cursor shown while streaming |
| `ChatInput.tsx` | `<Textarea>` (auto-resize), Send button, Shift+Enter for newline, Enter to send |

#### 2.8 Navigation

- [ ] Add `/chat` to `src/components/layout/navItems.ts`
- [ ] Add a `MessageSquare` icon entry to the sidebar

#### 2.9 Dependencies

```bash
npm install react-markdown remark-gfm highlight.js
```

- `react-markdown` — render assistant markdown safely
- `remark-gfm` — tables, strikethrough, task lists
- `highlight.js` — code block syntax highlighting (loaded lazily)

---

### Phase 3 — Optional: Conversation Persistence (DB)

> This phase is deferred. Implement only if persistent history across sessions is needed.

- [ ] Add `Conversation` and `Message` Django models in `apps/chat/models.py`
- [ ] Replace Zustand conversation list with `useQuery` fetching `/api/chat/conversations/`
- [ ] Keep Zustand only for streaming state (`selectedModel`, in-progress tokens)

---

### Phase 4 — Polish & UX

- [ ] **Regenerate** button on last assistant message
- [ ] **Stop streaming** button (abort the fetch `ReadableStream`)
- [ ] **System prompt editor** — allow user to override per conversation
- [ ] **Copy message** button on each bubble
- [ ] **Export conversation** as `.md` or `.txt`
- [ ] `localStorage` persistence of Zustand conversations (via `zustand/persist`)
- [ ] **Token counter** display (approximate, using char count / 4)

---

## Testing

### Backend — `apps/chat/tests/`

Run with: `cd backend && uv run pytest apps/chat/tests/ -v`

> All tests use the `core.settings.test` settings (SQLite, no pgvector). No
> `@pytest.mark.integration` needed — no vector DB queries.

---

#### `conftest.py` — shared fixtures

```python
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
```

---

#### `test_client.py` — `OllamaClient`

Mock `httpx.Client` at the module level; do not hit the real Ollama process.

```python
import json
import pytest
from unittest.mock import MagicMock, patch
from apps.chat.client import OllamaClient


@pytest.fixture
def client():
    return OllamaClient()


class TestListModels:
    def test_returns_model_list(self, client):
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "models": [{"name": "analysis-assistant:latest"}, {"name": "qwen2.5:3b"}]
        }
        with patch("apps.chat.client.httpx.Client") as MockClient:
            MockClient.return_value.__enter__.return_value.get.return_value = mock_response
            result = client.list_models()
        assert len(result) == 2
        assert result[0]["name"] == "analysis-assistant:latest"

    def test_raises_on_http_error(self, client):
        with patch("apps.chat.client.httpx.Client") as MockClient:
            MockClient.return_value.__enter__.return_value.get.return_value.raise_for_status.side_effect = Exception("500")
            with pytest.raises(Exception):
                client.list_models()


class TestChat:
    def test_posts_correct_payload(self, client):
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "message": {"role": "assistant", "content": "Hello!"}
        }
        with patch("apps.chat.client.httpx.Client") as MockClient:
            mock_http = MockClient.return_value.__enter__.return_value
            mock_http.post.return_value = mock_response
            result = client.chat("analysis-assistant", [{"role": "user", "content": "Hi"}])

        call_kwargs = mock_http.post.call_args
        payload = call_kwargs.kwargs["json"]
        assert payload["model"] == "analysis-assistant"
        assert payload["stream"] is False
        assert payload["messages"][0]["content"] == "Hi"
        assert result["message"]["content"] == "Hello!"


class TestChatStream:
    def test_yields_parsed_chunks(self, client):
        lines = [
            json.dumps({"message": {"content": "He"}, "done": False}),
            json.dumps({"message": {"content": "llo"}, "done": False}),
            json.dumps({"message": {"content": ""}, "done": True}),
        ]
        with patch("apps.chat.client.httpx.Client") as MockClient:
            mock_stream = MagicMock()
            mock_stream.__enter__.return_value.iter_lines.return_value = iter(lines)
            mock_stream.__enter__.return_value.raise_for_status.return_value = None
            MockClient.return_value.__enter__.return_value.stream.return_value = mock_stream
            chunks = list(client.chat_stream("analysis-assistant", [{"role": "user", "content": "Hi"}]))

        assert chunks[0]["message"]["content"] == "He"
        assert chunks[1]["message"]["content"] == "llo"
        assert chunks[2]["done"] is True

    def test_skips_empty_lines(self, client):
        lines = [
            "",
            json.dumps({"message": {"content": "Hi"}, "done": True}),
        ]
        with patch("apps.chat.client.httpx.Client") as MockClient:
            mock_stream = MagicMock()
            mock_stream.__enter__.return_value.iter_lines.return_value = iter(lines)
            mock_stream.__enter__.return_value.raise_for_status.return_value = None
            MockClient.return_value.__enter__.return_value.stream.return_value = mock_stream
            chunks = list(client.chat_stream("m", []))

        assert len(chunks) == 1
```

---

#### `test_services.py` — service layer

Mock `OllamaClient`; test business logic in isolation.

```python
import pytest
from unittest.mock import MagicMock, patch


class TestListModels:
    def test_delegates_to_client(self):
        with patch("apps.chat.services._client") as mock_client:
            mock_client.list_models.return_value = [{"name": "analysis-assistant:latest"}]
            from apps.chat.services import list_models
            result = list_models()
        assert result == [{"name": "analysis-assistant:latest"}]


class TestChat:
    def test_returns_content_string(self):
        with patch("apps.chat.services._client") as mock_client:
            mock_client.chat.return_value = {"message": {"content": "Hello!"}}
            from apps.chat.services import chat
            result = chat([{"role": "user", "content": "Hi"}])
        assert result == "Hello!"

    def test_uses_settings_model_when_none_given(self, settings):
        settings.OLLAMA_MODEL = "analysis-assistant"
        with patch("apps.chat.services._client") as mock_client:
            mock_client.chat.return_value = {"message": {"content": "ok"}}
            from apps.chat.services import chat
            chat([{"role": "user", "content": "test"}])
        call_args = mock_client.chat.call_args
        assert call_args.args[0] == "analysis-assistant"

    def test_uses_explicit_model_when_given(self):
        with patch("apps.chat.services._client") as mock_client:
            mock_client.chat.return_value = {"message": {"content": "ok"}}
            from apps.chat.services import chat
            chat([{"role": "user", "content": "test"}], model="qwen2.5:3b")
        assert mock_client.chat.call_args.args[0] == "qwen2.5:3b"


class TestStreamChat:
    def test_yields_tokens_and_stops_on_done(self):
        chunks = [
            {"message": {"content": "He"}, "done": False},
            {"message": {"content": "llo"}, "done": False},
            {"message": {"content": ""}, "done": True},
        ]
        with patch("apps.chat.services._client") as mock_client:
            mock_client.chat_stream.return_value = iter(chunks)
            from apps.chat.services import stream_chat
            tokens = list(stream_chat([{"role": "user", "content": "Hi"}]))
        assert tokens == ["He", "llo"]

    def test_skips_empty_token_chunks(self):
        chunks = [
            {"message": {"content": ""}, "done": False},
            {"message": {"content": "Hi"}, "done": True},
        ]
        with patch("apps.chat.services._client") as mock_client:
            mock_client.chat_stream.return_value = iter(chunks)
            from apps.chat.services import stream_chat
            tokens = list(stream_chat([]))
        assert tokens == ["Hi"]
```

---

#### `test_views.py` — HTTP endpoints

Uses the `authenticated_client` fixture from `conftest.py`.
Patches at the `services` module level to avoid touching `OllamaClient`.

```python
import json
import pytest
from unittest.mock import patch


@pytest.mark.django_db
class TestModelListView:
    def test_returns_model_names(self, authenticated_client):
        models = [{"name": "analysis-assistant:latest"}, {"name": "qwen2.5:3b"}]
        with patch("apps.chat.views.list_models", return_value=models):
            response = authenticated_client.get("/api/chat/models/")
        assert response.status_code == 200
        assert response.data["models"] == models

    def test_requires_authentication(self, api_client):
        response = api_client.get("/api/chat/models/")
        assert response.status_code == 401


@pytest.mark.django_db
class TestChatView:
    def test_returns_reply(self, authenticated_client):
        with patch("apps.chat.views.chat", return_value="Hello from Ollama!"):
            response = authenticated_client.post(
                "/api/chat/",
                {"messages": [{"role": "user", "content": "Hi"}]},
                format="json",
            )
        assert response.status_code == 200
        assert response.data["reply"] == "Hello from Ollama!"

    def test_accepts_explicit_model(self, authenticated_client):
        with patch("apps.chat.views.chat", return_value="ok") as mock_chat:
            authenticated_client.post(
                "/api/chat/",
                {
                    "messages": [{"role": "user", "content": "Hi"}],
                    "model": "qwen2.5:3b",
                },
                format="json",
            )
        assert mock_chat.call_args.kwargs.get("model") == "qwen2.5:3b" or \
               mock_chat.call_args.args[1] == "qwen2.5:3b"

    def test_rejects_invalid_role(self, authenticated_client):
        response = authenticated_client.post(
            "/api/chat/",
            {"messages": [{"role": "invalid", "content": "hi"}]},
            format="json",
        )
        assert response.status_code == 400

    def test_rejects_empty_messages(self, authenticated_client):
        response = authenticated_client.post(
            "/api/chat/",
            {"messages": []},
            format="json",
        )
        assert response.status_code == 400

    def test_requires_authentication(self, api_client):
        response = api_client.post("/api/chat/", {}, format="json")
        assert response.status_code == 401


@pytest.mark.django_db
class TestChatStreamView:
    def test_returns_event_stream_content_type(self, authenticated_client):
        with patch("apps.chat.views.stream_chat", return_value=iter(["Hello"])):
            response = authenticated_client.post(
                "/api/chat/stream/",
                {"messages": [{"role": "user", "content": "Hi"}]},
                format="json",
            )
        assert response.status_code == 200
        assert "text/event-stream" in response.get("Content-Type", "")

    def test_sse_format_contains_token(self, authenticated_client):
        with patch("apps.chat.views.stream_chat", return_value=iter(["Hello", " world"])):
            response = authenticated_client.post(
                "/api/chat/stream/",
                {"messages": [{"role": "user", "content": "Hi"}]},
                format="json",
            )
        content = b"".join(response.streaming_content).decode()
        assert 'data: {"token": "Hello"}' in content
        assert "data: [DONE]" in content

    def test_sets_no_cache_headers(self, authenticated_client):
        with patch("apps.chat.views.stream_chat", return_value=iter([])):
            response = authenticated_client.post(
                "/api/chat/stream/",
                {"messages": [{"role": "user", "content": "Hi"}]},
                format="json",
            )
        assert response.get("Cache-Control") == "no-cache"
        assert response.get("X-Accel-Buffering") == "no"

    def test_requires_authentication(self, api_client):
        response = api_client.post("/api/chat/stream/", {}, format="json")
        assert response.status_code == 401
```

---

### Frontend — tests

Run with: `cd frontend && npm test`

> Environment: `happy-dom`. Globals enabled — no need to import `describe`/`it`/`expect`.
> All API calls mocked at the module level with `vi.mock`.

---

#### `src/store/__tests__/chat.test.ts` — Zustand store

```ts
import { renderHook, act } from "@testing-library/react";
import { useChatStore } from "@/store/chat";

beforeEach(() => {
  useChatStore.setState({
    conversations: [],
    activeId: null,
    selectedModel: "analysis-assistant",
  });
});

describe("newConversation", () => {
  it("creates a conversation and sets it active", () => {
    const { result } = renderHook(() => useChatStore());
    let id: string;
    act(() => {
      id = result.current.newConversation("qwen2.5:3b");
    });
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.activeId).toBe(id!);
    expect(result.current.conversations[0].model).toBe("qwen2.5:3b");
  });
});

describe("addMessage", () => {
  it("appends a message to the correct conversation", () => {
    const { result } = renderHook(() => useChatStore());
    let id: string;
    act(() => { id = result.current.newConversation("analysis-assistant"); });
    act(() => {
      result.current.addMessage(id!, { role: "user", content: "Hello" });
    });
    expect(result.current.conversations[0].messages[0].content).toBe("Hello");
  });
});

describe("appendToken", () => {
  it("appends to the last assistant message if one is streaming", () => {
    const { result } = renderHook(() => useChatStore());
    let id: string;
    act(() => { id = result.current.newConversation("analysis-assistant"); });
    act(() => {
      result.current.addMessage(id!, { role: "assistant", content: "" });
    });
    act(() => { result.current.appendToken(id!, "Hi"); });
    act(() => { result.current.appendToken(id!, "!"); });
    const msgs = result.current.conversations[0].messages;
    expect(msgs[msgs.length - 1].content).toBe("Hi!");
  });
});

describe("deleteConversation", () => {
  it("removes the conversation and clears activeId if it was active", () => {
    const { result } = renderHook(() => useChatStore());
    let id: string;
    act(() => { id = result.current.newConversation("analysis-assistant"); });
    act(() => { result.current.deleteConversation(id!); });
    expect(result.current.conversations).toHaveLength(0);
    expect(result.current.activeId).toBeNull();
  });
});

describe("setModel", () => {
  it("updates selectedModel", () => {
    const { result } = renderHook(() => useChatStore());
    act(() => { result.current.setModel("qwen2.5:3b"); });
    expect(result.current.selectedModel).toBe("qwen2.5:3b");
  });
});
```

---

#### `src/hooks/__tests__/useOllamaChat.test.ts` — streaming hook

```ts
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { vi } from "vitest";

vi.mock("@/store/chat", () => ({
  useChatStore: vi.fn(),
}));

import { useChatStore } from "@/store/chat";
import { useStreamingChat } from "@/hooks/useOllamaChat";

const mockAppendToken = vi.fn();
const mockAddMessage = vi.fn();

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useChatStore).mockReturnValue({
    appendToken: mockAppendToken,
    addMessage: mockAddMessage,
    activeId: "conv-1",
    selectedModel: "analysis-assistant",
  } as never);
});

describe("useStreamingChat", () => {
  it("calls appendToken for each SSE token line", async () => {
    const sseLines = [
      'data: {"token": "He"}\n\n',
      'data: {"token": "llo"}\n\n',
      "data: [DONE]\n\n",
    ].join("");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseLines));
        controller.close();
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
    });

    const { result } = renderHook(() => useStreamingChat(), { wrapper });

    await act(async () => {
      await result.current.send({
        messages: [{ role: "user", content: "Hi" }],
        conversationId: "conv-1",
      });
    });

    await waitFor(() => {
      expect(mockAppendToken).toHaveBeenCalledWith("conv-1", "He");
      expect(mockAppendToken).toHaveBeenCalledWith("conv-1", "llo");
      expect(mockAppendToken).toHaveBeenCalledTimes(2);
    });
  });

  it("sets streaming=false after [DONE]", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, body: stream });

    const { result } = renderHook(() => useStreamingChat(), { wrapper });

    act(() => {
      result.current.send({ messages: [], conversationId: "conv-1" });
    });
    await waitFor(() => expect(result.current.streaming).toBe(false));
  });

  it("sends Authorization header with JWT token", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(c) { c.enqueue(encoder.encode("data: [DONE]\n\n")); c.close(); },
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, body: stream });

    const { result } = renderHook(() => useStreamingChat(), { wrapper });
    await act(async () => {
      await result.current.send({ messages: [], conversationId: "conv-1" });
    });

    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    const headers = fetchCall[1]?.headers as Record<string, string>;
    expect(headers["Authorization"]).toMatch(/^Bearer /);
  });
});
```

---

#### `src/components/chat/__tests__/ChatBubble.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatBubble } from "@/components/chat/ChatBubble";

const userMsg = { role: "user" as const, content: "Hello there" };
const assistantMsg = { role: "assistant" as const, content: "Hi! How can I help?" };

describe("ChatBubble", () => {
  it("renders user message content", () => {
    render(<ChatBubble message={userMsg} />);
    expect(screen.getByText("Hello there")).toBeInTheDocument();
  });

  it("applies user bubble styling", () => {
    const { container } = render(<ChatBubble message={userMsg} />);
    // User bubbles aligned right
    expect(container.firstChild).toHaveClass("justify-end");
  });

  it("applies assistant bubble styling", () => {
    const { container } = render(<ChatBubble message={assistantMsg} />);
    expect(container.firstChild).toHaveClass("justify-start");
  });

  it("copy button copies content to clipboard", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    render(<ChatBubble message={assistantMsg} />);
    await userEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Hi! How can I help?");
  });
});
```

---

#### `src/components/chat/__tests__/ChatInput.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInput } from "@/components/chat/ChatInput";

const onSend = vi.fn();

beforeEach(() => vi.clearAllMocks());

describe("ChatInput", () => {
  it("calls onSend with trimmed text on Enter", async () => {
    render(<ChatInput onSend={onSend} disabled={false} />);
    const textarea = screen.getByRole("textbox");
    await userEvent.type(textarea, "Hello{Enter}");
    expect(onSend).toHaveBeenCalledWith("Hello");
  });

  it("inserts a newline on Shift+Enter without calling onSend", async () => {
    render(<ChatInput onSend={onSend} disabled={false} />);
    const textarea = screen.getByRole("textbox");
    await userEvent.type(textarea, "Line1{Shift>}{Enter}{/Shift}Line2");
    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("Line1\nLine2");
  });

  it("disables the Send button while streaming", () => {
    render(<ChatInput onSend={onSend} disabled={true} />);
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("does not call onSend for blank input", async () => {
    render(<ChatInput onSend={onSend} disabled={false} />);
    await userEvent.type(screen.getByRole("textbox"), "   {Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("clears the textarea after sending", async () => {
    render(<ChatInput onSend={onSend} disabled={false} />);
    const textarea = screen.getByRole("textbox");
    await userEvent.type(textarea, "Hello{Enter}");
    expect(textarea).toHaveValue("");
  });
});
```

---

#### `src/components/chat/__tests__/ModelSelector.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { vi } from "vitest";

vi.mock("@/api/chat", () => ({
  listModels: vi.fn(),
}));
vi.mock("@/store/chat", () => ({
  useChatStore: vi.fn(),
}));

import { listModels } from "@/api/chat";
import { useChatStore } from "@/store/chat";
import { ModelSelector } from "@/components/chat/ModelSelector";

const mockSetModel = vi.fn();
const mockModels = [
  { name: "analysis-assistant:latest", model: "analysis-assistant:latest" },
  { name: "qwen2.5:3b", model: "qwen2.5:3b" },
];

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useChatStore).mockReturnValue({
    selectedModel: "analysis-assistant:latest",
    setModel: mockSetModel,
  } as never);
  vi.mocked(listModels).mockResolvedValue(mockModels as never);
});

describe("ModelSelector", () => {
  it("renders both available models as options", async () => {
    render(<ModelSelector />, { wrapper });
    expect(await screen.findByText("analysis-assistant:latest")).toBeInTheDocument();
    expect(screen.getByText("qwen2.5:3b")).toBeInTheDocument();
  });

  it("calls setModel when the user selects a different model", async () => {
    render(<ModelSelector />, { wrapper });
    await screen.findByText("analysis-assistant:latest");
    await userEvent.selectOptions(screen.getByRole("combobox"), "qwen2.5:3b");
    expect(mockSetModel).toHaveBeenCalledWith("qwen2.5:3b");
  });

  it("shows the current selectedModel as the active option", async () => {
    render(<ModelSelector />, { wrapper });
    await screen.findByText("analysis-assistant:latest");
    expect(screen.getByRole("combobox")).toHaveValue("analysis-assistant:latest");
  });
});
```

---

### Manual verification steps

1. `just up` — all Docker services start cleanly
2. `just be-test` — all backend tests pass (including new `apps/chat/tests/`)
3. `just fe-test` — all frontend tests pass (including new chat tests)
4. Navigate to `/chat` — page loads, model selector shows `analysis-assistant` and `qwen2.5:3b`
5. Send a message — streaming tokens appear one by one with blinking cursor indicator
6. Start a new conversation — previous conversation appears in sidebar with separate history
7. Switch model mid-session — next message uses the selected model
8. Open DevTools Network tab — `/api/chat/stream/` response has `Content-Type: text/event-stream`
9. Refresh the page — conversations are preserved (via `zustand/persist` in Phase 4; Zustand in-memory only for Phase 1–2)

---

## File Checklist

### Backend — new files

```
backend/apps/chat/__init__.py
backend/apps/chat/apps.py
backend/apps/chat/client.py
backend/apps/chat/serializers.py
backend/apps/chat/services.py
backend/apps/chat/views.py
backend/apps/chat/urls.py
backend/apps/chat/tests/__init__.py
backend/apps/chat/tests/test_client.py
backend/apps/chat/tests/test_services.py
backend/apps/chat/tests/test_views.py
```

### Backend — modified files

```
backend/core/settings/base.py      ← OLLAMA_* settings, INSTALLED_APPS += "apps.chat"
backend/core/urls.py               ← include("apps.chat.urls")
backend/.env.example               ← OLLAMA_BASE_URL, OLLAMA_MODEL, OLLAMA_TIMEOUT
```

### Frontend — new files

```
frontend/src/types/chat.ts
frontend/src/api/chat.ts
frontend/src/store/chat.ts
frontend/src/hooks/useOllamaChat.ts
frontend/src/routes/chat.tsx
frontend/src/components/chat/ChatLayout.tsx
frontend/src/components/chat/ConversationSidebar.tsx
frontend/src/components/chat/ModelSelector.tsx
frontend/src/components/chat/MessageThread.tsx
frontend/src/components/chat/ChatBubble.tsx
frontend/src/components/chat/MarkdownRenderer.tsx
frontend/src/components/chat/StreamingIndicator.tsx
frontend/src/components/chat/ChatInput.tsx
frontend/src/components/chat/__tests__/ChatBubble.test.tsx
frontend/src/components/chat/__tests__/ChatInput.test.tsx
frontend/src/components/chat/__tests__/ModelSelector.test.tsx
frontend/src/hooks/__tests__/useOllamaChat.test.ts
frontend/src/store/__tests__/chat.test.ts
```

### Frontend — modified files

```
frontend/src/api/queryKeys.ts              ← chat.models key
frontend/src/components/layout/navItems.ts ← /chat nav entry
frontend/src/routeTree.gen.ts             ← auto-generated by TanStack Router
frontend/package.json                      ← react-markdown, remark-gfm
```

### Docs — modified files

```
docs/standards/api-contracts.md    ← three new Ollama chat endpoints
```

---

## Risks & Notes

| Risk | Mitigation |
|---|---|
| Ollama streaming uses raw NDJSON over HTTP, not SSE — `ReadableStream` in browser must parse lines manually | Document the parsing util in `useStreamingChat`; add test for malformed chunks |
| `StreamingHttpResponse` in Django does not play well with WSGI on some reverse proxies (nginx buffering) | Set `X-Accel-Buffering: no` header; use ASGI / Daphne for production streaming |
| `analysis-assistant` context window is 4096 tokens — long conversations will overflow | Truncate message history: keep system prompt + last N messages that fit within ~3500 tokens |
| Docker: when Django runs in a container, `localhost:11434` won't resolve to Ollama on the host | Use `host.docker.internal:11434` (Docker Desktop) or the host's gateway IP; document in `.env.example` |
| Ollama is currently bound only to `127.0.0.1` — not accessible from other machines | Fine for local dev; leave as-is; note in production guide |
| No rate limiting on chat endpoints | Add `throttle_classes` to `ChatView` and `ChatStreamView` in a follow-up |

---

## Decision Log

| Decision | Rationale |
|---|---|
| Use `httpx` (not `ollama` Python SDK) | `httpx` is already likely present via tests; avoids adding another dep; streaming support is equally clean |
| No DB persistence in Phase 1–2 | Keeps scope small; Zustand + `persist` is sufficient for single-user local dev |
| Streaming via `fetch` ReadableStream, not EventSource | `EventSource` is GET-only; chat requires POST with body |
| New `apps/chat/` app, not extending `apps/embeddings/` | Separation of concerns — Ollama chat is independent of the RAG pipeline |
| `analysis-assistant` as default model | Has a tuned system prompt and temperature suitable for the project's analysis focus |
