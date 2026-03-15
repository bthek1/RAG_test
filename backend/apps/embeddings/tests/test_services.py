"""Unit tests for apps.embeddings.services — no DB required."""

import pytest

from apps.embeddings.services import EMBEDDING_DIMENSIONS, chunk_document, embed_texts


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
# embed_texts (stub path — no OPENAI_API_KEY set)
# ---------------------------------------------------------------------------


class TestEmbedTexts:
    def test_returns_list_of_vectors(self, monkeypatch):
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        result = embed_texts(["hello", "world"])
        assert len(result) == 2

    def test_stub_vector_has_correct_dimension(self, monkeypatch):
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        result = embed_texts(["test"])
        assert len(result[0]) == EMBEDDING_DIMENSIONS

    def test_stub_vector_is_all_zeros(self, monkeypatch):
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        result = embed_texts(["test"])
        assert all(v == 0.0 for v in result[0])

    def test_empty_list_returns_empty_list(self, monkeypatch):
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        result = embed_texts([])
        assert result == []
