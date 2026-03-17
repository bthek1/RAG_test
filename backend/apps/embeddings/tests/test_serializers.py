"""Unit tests for apps.embeddings.serializers — no DB required."""

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.embeddings.serializers import DocumentIngestSerializer


def _make_file(name: str, size_bytes: int = 100, content_type: str = "application/octet-stream") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, b"x" * size_bytes, content_type=content_type)


# ---------------------------------------------------------------------------
# DocumentIngestSerializer.validate_file
# ---------------------------------------------------------------------------


class TestDocumentIngestSerializerValidateFile:
    """validate_file: extension whitelist and size limit."""

    @pytest.mark.parametrize("filename", [
        "doc.pdf", "notes.txt", "readme.md",
        "page.html", "page.htm",
        "report.docx", "slides.pptx",
        "data.csv", "data.tsv",
        "data.json", "data.jsonl",
        "sheet.xlsx",
    ])
    def test_accepted_extensions_pass(self, filename):
        serializer = DocumentIngestSerializer(
            data={"title": "T", "file": _make_file(filename)}
        )
        assert serializer.is_valid(), serializer.errors

    @pytest.mark.parametrize("filename", [
        "archive.zip", "image.png", "binary.exe",
        "script.py", "style.css", "data.xml",
    ])
    def test_unsupported_extensions_rejected(self, filename):
        serializer = DocumentIngestSerializer(
            data={"title": "T", "file": _make_file(filename)}
        )
        assert not serializer.is_valid()
        assert "file" in serializer.errors

    def test_file_over_50mb_rejected(self):
        fifty_one_mb = 51 * 1024 * 1024
        serializer = DocumentIngestSerializer(
            data={"title": "T", "file": _make_file("big.pdf", size_bytes=fifty_one_mb)}
        )
        assert not serializer.is_valid()
        assert "file" in serializer.errors

    def test_file_exactly_50mb_accepted(self):
        fifty_mb = 50 * 1024 * 1024
        serializer = DocumentIngestSerializer(
            data={"title": "T", "file": _make_file("ok.pdf", size_bytes=fifty_mb)}
        )
        assert serializer.is_valid(), serializer.errors

    def test_error_message_lists_allowed_types(self):
        serializer = DocumentIngestSerializer(
            data={"title": "T", "file": _make_file("bad.exe")}
        )
        assert not serializer.is_valid()
        error_text = str(serializer.errors["file"])
        assert ".pdf" in error_text  # allowed types mentioned in message


# ---------------------------------------------------------------------------
# DocumentIngestSerializer.validate — mutual exclusion of content / file
# ---------------------------------------------------------------------------


class TestDocumentIngestSerializerValidate:
    def test_content_only_is_valid(self):
        serializer = DocumentIngestSerializer(
            data={"title": "T", "content": "Some text here."}
        )
        assert serializer.is_valid(), serializer.errors

    def test_file_only_is_valid(self):
        serializer = DocumentIngestSerializer(
            data={"title": "T", "file": _make_file("doc.txt")}
        )
        assert serializer.is_valid(), serializer.errors

    def test_neither_content_nor_file_invalid(self):
        serializer = DocumentIngestSerializer(data={"title": "T"})
        assert not serializer.is_valid()
        assert "non_field_errors" in serializer.errors

    def test_both_content_and_file_invalid(self):
        serializer = DocumentIngestSerializer(
            data={
                "title": "T",
                "content": "Some text.",
                "file": _make_file("doc.pdf"),
            }
        )
        assert not serializer.is_valid()
        assert "non_field_errors" in serializer.errors

    def test_blank_content_treated_as_missing(self):
        """content='  ' (whitespace only) should be treated as no content."""
        serializer = DocumentIngestSerializer(data={"title": "T", "content": "   "})
        assert not serializer.is_valid()

    def test_source_is_optional(self):
        serializer = DocumentIngestSerializer(
            data={"title": "T", "content": "Valid text."}
        )
        assert serializer.is_valid(), serializer.errors

    def test_source_can_be_blank(self):
        serializer = DocumentIngestSerializer(
            data={"title": "T", "content": "Valid text.", "source": ""}
        )
        assert serializer.is_valid(), serializer.errors

    def test_title_is_required(self):
        serializer = DocumentIngestSerializer(data={"content": "Some text."})
        assert not serializer.is_valid()
        assert "title" in serializer.errors

    def test_title_max_length_enforced(self):
        serializer = DocumentIngestSerializer(
            data={"title": "x" * 513, "content": "Text."}
        )
        assert not serializer.is_valid()
        assert "title" in serializer.errors
