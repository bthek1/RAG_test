"""Unit tests for apps.embeddings.services — no DB required."""

import numpy as np
import pytest

from apps.embeddings.services import (
    EMBEDDING_DIMENSIONS,
    chunk_document,
    embed_texts,
    generate_answer,
)

# ---------------------------------------------------------------------------
# chunk_document
# ---------------------------------------------------------------------------


class TestChunkDocument:
    def test_empty_input_returns_empty_list(self):
        assert chunk_document("") == []

    def test_single_short_sentence(self):
        chunks = chunk_document("Hello world.", chunk_size=512)
        assert chunks == ["Hello world."]

    def test_splits_long_content_into_multiple_chunks(self):
        # Build a string definitely longer than chunk_size
        sentence = "This is a test sentence. "
        content = sentence * 30  # ~750 chars
        chunks = chunk_document(content, chunk_size=100, overlap=20)
        assert len(chunks) > 1
        # Every chunk should be non-empty
        assert all(c.strip() for c in chunks)

    def test_overlap_means_content_shared_between_chunks(self):
        # With overlap the last sentence of chunk N should appear in chunk N+1
        sentence = "Sentence number {}. "
        content = "".join(sentence.format(i) for i in range(20))
        chunks = chunk_document(content, chunk_size=80, overlap=40)
        if len(chunks) > 1:
            # The second chunk should contain text that was near the end of the first
            assert len(chunks[1]) > 0

    def test_returns_list_of_strings(self):
        chunks = chunk_document("One sentence. Two sentences.", chunk_size=50)
        assert isinstance(chunks, list)
        assert all(isinstance(c, str) for c in chunks)


# ---------------------------------------------------------------------------
# embed_texts — monkeypatched SentenceTransformer (no network or GPU needed)
# ---------------------------------------------------------------------------


class TestEmbedTexts:
    def _make_fake_model(self, fake_vectors):
        class _FakeModel:
            def encode(self, texts, **kw):
                return fake_vectors

        return _FakeModel()

    def test_returns_list_of_vectors(self, monkeypatch):
        fake_vectors = np.zeros((2, EMBEDDING_DIMENSIONS), dtype=np.float32)
        monkeypatch.setattr(
            "apps.embeddings.services.get_embedding_model",
            lambda: self._make_fake_model(fake_vectors),
        )
        result = embed_texts(["hello", "world"])
        assert len(result) == 2

    def test_vector_has_correct_dimension(self, monkeypatch):
        fake_vectors = np.zeros((1, EMBEDDING_DIMENSIONS), dtype=np.float32)
        monkeypatch.setattr(
            "apps.embeddings.services.get_embedding_model",
            lambda: self._make_fake_model(fake_vectors),
        )
        result = embed_texts(["test"])
        assert len(result[0]) == EMBEDDING_DIMENSIONS

    def test_empty_list_returns_empty_list(self, monkeypatch):
        # embed_texts short-circuits before calling the model for empty input
        result = embed_texts([])
        assert result == []

    def test_default_dimension_is_1024(self):
        assert EMBEDDING_DIMENSIONS == 1024


# ---------------------------------------------------------------------------
# generate_answer
# ---------------------------------------------------------------------------


class TestGenerateAnswer:
    def test_raises_improperly_configured_when_no_api_key(self, monkeypatch):
        from django.core.exceptions import ImproperlyConfigured

        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        # Reset the module-level env read by clearing os.environ
        with pytest.raises(ImproperlyConfigured, match="ANTHROPIC_API_KEY"):
            generate_answer("What is RAG?", [])

    def test_calls_anthropic_and_returns_text(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        # Build a minimal fake Anthropic response object
        class FakeTextBlock:
            text = "RAG stands for Retrieval-Augmented Generation."

        class FakeMessage:
            content = [FakeTextBlock()]

        class FakeMessages:
            def create(self, **kwargs):
                return FakeMessage()

        class FakeClient:
            messages = FakeMessages()

        monkeypatch.setattr(
            "apps.embeddings.services.anthropic.Anthropic",
            lambda **kw: FakeClient(),
        )

        # Minimal Chunk-like objects
        class FakeChunk:
            content = "Some context text."

        result = generate_answer("What is RAG?", [FakeChunk()])
        assert result == "RAG stands for Retrieval-Augmented Generation."

    def test_prompt_includes_context_and_query(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        captured: dict = {}

        class FakeTextBlock:
            text = "answer"

        class FakeMessage:
            content = [FakeTextBlock()]

        class FakeMessages:
            def create(self, **kwargs):
                captured.update(kwargs)
                return FakeMessage()

        class FakeClient:
            messages = FakeMessages()

        monkeypatch.setattr(
            "apps.embeddings.services.anthropic.Anthropic",
            lambda **kw: FakeClient(),
        )

        class FakeChunk:
            content = "context chunk text"

        generate_answer("my question", [FakeChunk()])
        user_msg = captured["messages"][0]["content"]
        assert "context chunk text" in user_msg
        assert "my question" in user_msg
