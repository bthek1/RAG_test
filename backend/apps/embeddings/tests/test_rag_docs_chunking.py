"""Tests for PDF extraction and chunking using real Rag_Docs files.

These tests read the actual Australian policy PDFs from ``Rag_Docs/`` and verify
that the extraction and chunking pipeline produces sensible, well-formed output.

They are **pure filesystem tests** — no database, no ML model.
Marked ``@pytest.mark.development`` so they are included in a full suite but
clearly scoped as needing local file access.  They are automatically skipped
if the ``Rag_Docs/Australia_policies`` directory is not present.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from apps.embeddings.services import chunk_document, extract_text_from_pdf

# ---------------------------------------------------------------------------
# Locate the real PDF corpus
# ---------------------------------------------------------------------------

RAG_DOCS_DIR = (
    Path(
        __file__
    ).parent.parent.parent.parent.parent  # tests/  # embeddings/  # apps/  # backend/  # project root
    / "Rag_Docs"
    / "Australia_policies"
)

PDF_FILES = sorted(RAG_DOCS_DIR.glob("*.pdf")) if RAG_DOCS_DIR.exists() else []

# ---------------------------------------------------------------------------
# Skip entire module when corpus is absent
# ---------------------------------------------------------------------------

pytestmark = pytest.mark.skipif(
    not RAG_DOCS_DIR.exists() or not PDF_FILES,
    reason="Rag_Docs/Australia_policies not found or empty",
)


# ---------------------------------------------------------------------------
# Text extraction tests
# ---------------------------------------------------------------------------


@pytest.mark.development
class TestPdfExtraction:
    """Text extraction from real Australian policy PDFs."""

    @pytest.mark.parametrize("pdf_path", PDF_FILES, ids=[p.name for p in PDF_FILES])
    def test_extraction_returns_non_empty_string(self, pdf_path: Path) -> None:
        """Every PDF must yield a non-empty string."""
        text = extract_text_from_pdf(pdf_path.read_bytes())
        assert isinstance(text, str)
        assert text.strip(), f"{pdf_path.name}: extraction returned empty text"

    @pytest.mark.parametrize("pdf_path", PDF_FILES, ids=[p.name for p in PDF_FILES])
    def test_extraction_contains_enough_words(self, pdf_path: Path) -> None:
        """Extracted text must contain at least 50 words (not just noise)."""
        text = extract_text_from_pdf(pdf_path.read_bytes())
        words = text.split()
        assert len(words) >= 50, (
            f"{pdf_path.name}: only {len(words)} words extracted — possible scan/image PDF"
        )

    @pytest.mark.parametrize("pdf_path", PDF_FILES, ids=[p.name for p in PDF_FILES])
    def test_extraction_is_idempotent(self, pdf_path: Path) -> None:
        """Extracting the same file twice yields identical results."""
        raw = pdf_path.read_bytes()
        assert extract_text_from_pdf(raw) == extract_text_from_pdf(raw)

    @pytest.mark.parametrize("pdf_path", PDF_FILES, ids=[p.name for p in PDF_FILES])
    def test_extraction_contains_printable_ascii(self, pdf_path: Path) -> None:
        """Extracted text must contain at least some printable ASCII letters."""
        text = extract_text_from_pdf(pdf_path.read_bytes())
        alpha_chars = sum(1 for c in text if c.isalpha())
        assert alpha_chars >= 20, (
            f"{pdf_path.name}: only {alpha_chars} alpha characters — possible encoding issue"
        )

    def test_all_pdfs_extractable(self) -> None:
        """All PDFs can be extracted without raising an exception."""
        failures = []
        for pdf_path in PDF_FILES:
            try:
                extract_text_from_pdf(pdf_path.read_bytes())
            except Exception as exc:
                failures.append(f"{pdf_path.name}: {exc}")
        assert not failures, "Extraction failed for:\n" + "\n".join(failures)


# ---------------------------------------------------------------------------
# Chunking tests
# ---------------------------------------------------------------------------


@pytest.mark.development
class TestChunking:
    """Chunking behaviour on content extracted from real PDFs."""

    @pytest.mark.parametrize("pdf_path", PDF_FILES, ids=[p.name for p in PDF_FILES])
    def test_at_least_one_chunk_produced(self, pdf_path: Path) -> None:
        """Each document must yield at least one chunk."""
        text = extract_text_from_pdf(pdf_path.read_bytes())
        chunks = chunk_document(text)
        assert len(chunks) >= 1, f"{pdf_path.name}: no chunks produced"

    @pytest.mark.parametrize("pdf_path", PDF_FILES, ids=[p.name for p in PDF_FILES])
    def test_no_chunk_is_empty(self, pdf_path: Path) -> None:
        """The chunker must not produce blank or whitespace-only chunks."""
        text = extract_text_from_pdf(pdf_path.read_bytes())
        chunks = chunk_document(text)
        for i, chunk in enumerate(chunks):
            assert chunk.strip(), f"{pdf_path.name}: chunk {i} is empty"

    @pytest.mark.parametrize("pdf_path", PDF_FILES, ids=[p.name for p in PDF_FILES])
    def test_chunks_are_strings(self, pdf_path: Path) -> None:
        """Every returned chunk is a plain string."""
        text = extract_text_from_pdf(pdf_path.read_bytes())
        chunks = chunk_document(text)
        for i, chunk in enumerate(chunks):
            assert isinstance(chunk, str), (
                f"{pdf_path.name}: chunk {i} is {type(chunk)}"
            )

    @pytest.mark.parametrize("pdf_path", PDF_FILES, ids=[p.name for p in PDF_FILES])
    def test_chunk_size_reasonable(self, pdf_path: Path) -> None:
        """No chunk should be pathologically oversized.

        Australian legislation uses semicolons and colons inside numbered
        sub-clauses rather than sentence-ending punctuation, so the sentence-
        boundary chunker may accumulate many sub-clauses into a single chunk.
        We allow up to 8× chunk_size (4 096 chars) as a generous upper bound
        that still catches runaway merges.
        """
        text = extract_text_from_pdf(pdf_path.read_bytes())
        chunks = chunk_document(text, chunk_size=512, overlap=64)
        for i, chunk in enumerate(chunks):
            assert len(chunk) <= 512 * 8, (
                f"{pdf_path.name}: chunk {i} has {len(chunk)} chars (> 8 × chunk_size=512)"
            )

    @pytest.mark.parametrize("pdf_path", PDF_FILES, ids=[p.name for p in PDF_FILES])
    def test_consecutive_chunks_are_distinct(self, pdf_path: Path) -> None:
        """Two consecutive chunks must not be identical."""
        text = extract_text_from_pdf(pdf_path.read_bytes())
        chunks = chunk_document(text)
        if len(chunks) < 2:
            pytest.skip(f"{pdf_path.name}: only one chunk — cannot test distinctness")
        for i in range(len(chunks) - 1):
            assert chunks[i] != chunks[i + 1], (
                f"{pdf_path.name}: chunks {i} and {i + 1} are identical"
            )

    @pytest.mark.parametrize("pdf_path", PDF_FILES, ids=[p.name for p in PDF_FILES])
    def test_first_sentence_present_in_first_chunk(self, pdf_path: Path) -> None:
        """The opening words of the document should appear in the first chunk."""
        text = extract_text_from_pdf(pdf_path.read_bytes())
        chunks = chunk_document(text)
        # Take first 30 chars of extracted text as a fingerprint
        fingerprint = text.strip()[:30]
        assert fingerprint in chunks[0], (
            f"{pdf_path.name}: opening text {fingerprint!r} not found in first chunk"
        )

    @pytest.mark.parametrize("pdf_path", PDF_FILES, ids=[p.name for p in PDF_FILES])
    def test_combined_chunks_cover_first_sentences(self, pdf_path: Path) -> None:
        """First few sentences of extracted text must appear somewhere across chunks."""
        text = extract_text_from_pdf(pdf_path.read_bytes())
        chunks = chunk_document(text)
        combined = " ".join(chunks)

        sentences = re.split(r"(?<=[.!?])\s+", text.strip())[:3]
        for sentence in sentences:
            fragment = sentence[:40]
            assert fragment in combined, (
                f"{pdf_path.name}: early sentence fragment {fragment!r} lost during chunking"
            )

    def test_larger_document_yields_more_chunks(self) -> None:
        """The largest PDF (by extracted text) should produce more chunks than the smallest."""
        if len(PDF_FILES) < 2:
            pytest.skip("Need at least 2 PDFs to compare chunk counts")

        texts = [(p, extract_text_from_pdf(p.read_bytes())) for p in PDF_FILES]
        texts.sort(key=lambda x: len(x[1]))
        smallest_path, smallest_text = texts[0]
        largest_path, largest_text = texts[-1]

        # Only meaningful when the size difference is significant (> 20 %)
        if len(largest_text) < len(smallest_text) * 1.2:
            pytest.skip("Documents too similar in length to compare chunk counts")

        small_chunks = chunk_document(smallest_text)
        large_chunks = chunk_document(largest_text)
        assert len(large_chunks) > len(small_chunks), (
            f"{largest_path.name} ({len(large_chunks)} chunks) should have more chunks than "
            f"{smallest_path.name} ({len(small_chunks)} chunks)"
        )

    def test_smaller_chunk_size_produces_more_chunks(self) -> None:
        """Halving chunk_size should increase (or at least not decrease) the chunk count."""
        text = extract_text_from_pdf(PDF_FILES[0].read_bytes())
        chunks_256 = chunk_document(text, chunk_size=256, overlap=32)
        chunks_1024 = chunk_document(text, chunk_size=1024, overlap=128)
        assert len(chunks_256) >= len(chunks_1024), (
            f"chunk_size=256 → {len(chunks_256)} chunks; "
            f"chunk_size=1024 → {len(chunks_1024)} chunks — expected ≥"
        )

    @pytest.mark.parametrize("chunk_size", [256, 512, 1024])
    def test_chunk_count_positive_for_various_sizes(self, chunk_size: int) -> None:
        """chunk_document always returns at least one chunk for real PDF content."""
        text = extract_text_from_pdf(PDF_FILES[0].read_bytes())
        chunks = chunk_document(text, chunk_size=chunk_size, overlap=chunk_size // 8)
        assert len(chunks) >= 1

    @pytest.mark.parametrize("chunk_size", [256, 512, 1024])
    def test_all_chunks_non_empty_for_various_sizes(self, chunk_size: int) -> None:
        """No empty chunk regardless of chunk_size setting."""
        text = extract_text_from_pdf(PDF_FILES[0].read_bytes())
        chunks = chunk_document(text, chunk_size=chunk_size, overlap=chunk_size // 8)
        empties = [i for i, c in enumerate(chunks) if not c.strip()]
        assert not empties, (
            f"Empty chunks at indices {empties} with chunk_size={chunk_size}"
        )
