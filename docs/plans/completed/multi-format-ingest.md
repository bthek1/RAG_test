# Plan: Multi-Format Document Ingest

**Status:** Complete  
**Date:** 2026-03-17  
**Depends on:** `docs/plans/pdf-upload.md` (PDF ingest — complete)

---

## Goal

Extend the RAG ingest pipeline to accept the most common document formats beyond PDF. Users should be able to upload or paste content from plain text, Markdown, HTML, Word documents, PowerPoint presentations, CSV/TSV, JSON/JSONL, and Excel spreadsheets — all feeding into the same existing chunking → embedding → storage pipeline.

---

## Background

The current `POST /api/embeddings/documents/` endpoint accepts either a JSON `content` string or a multipart PDF file. The backend already has the full pipeline (`chunk_document`, `embed_texts`, `ingest_document`). The only thing each new format needs is a `text_from_<format>(file_bytes) -> str` extractor in `services.py`.

The serializer currently validates `file` as PDF-only (hardcoded `.pdf` extension check). This validation must be generalised to a whitelist of supported MIME types / extensions, and each format needs its own extraction path in `perform_create`.

**Format scope for this plan:**

| Category | Formats | Library |
|---|---|---|
| Plain text | `.txt`, `.md` | stdlib |
| Web | `.html`, `.htm` | `beautifulsoup4` + `lxml` |
| Office — docs | `.docx` | `python-docx` |
| Office — slides | `.pptx` | `python-pptx` |
| Structured data | `.csv`, `.tsv` | stdlib `csv` |
| Structured data | `.json`, `.jsonl` | stdlib `json` |
| Structured data | `.xlsx` | `openpyxl` |

**Out of scope for this plan:** `.doc` (legacy binary Word), `.rtf`, `.epub`, `.eml`/`.mbox`, source code files, scanned images / OCR.

**Design principle — extraction only, pipeline unchanged:**  
Every extractor converts its input to a plain text string. The output feeds directly into the existing `ingest_document()` call — no changes to chunking, embedding, or storage.

---

## Phases

### Phase 1 — Plain Text Formats (TXT, Markdown, HTML)

Zero new dependencies for TXT/MD. `beautifulsoup4` + `lxml` are already common and lightweight.

**New extractors in `backend/apps/embeddings/services.py`:**

```python
def extract_text_from_txt(file_bytes: bytes) -> str:
    """Decode UTF-8 plain text or Markdown, stripping YAML front matter if present."""
    text = file_bytes.decode("utf-8", errors="replace").strip()
    # Strip YAML front matter (--- ... ---)
    if text.startswith("---"):
        end = text.find("---", 3)
        if end != -1:
            text = text[end + 3:].strip()
    if not text:
        raise ValueError("File contains no extractable text.")
    return text


def extract_text_from_html(file_bytes: bytes) -> str:
    """Strip HTML tags and return visible text."""
    from bs4 import BeautifulSoup  # local import — optional dep
    soup = BeautifulSoup(file_bytes, "lxml")
    for tag in soup(["script", "style", "nav", "footer", "head"]):
        tag.decompose()
    text = soup.get_text(separator="\n")
    text = "\n".join(line.strip() for line in text.splitlines() if line.strip())
    if not text:
        raise ValueError("No visible text found in HTML file.")
    return text
```

**Dependencies (`backend/pyproject.toml`):**
```toml
"beautifulsoup4>=4.12",
"lxml>=5.0",
```

- [ ] Add `beautifulsoup4` and `lxml` to `pyproject.toml`
- [ ] Run `uv sync` (or `just be-install`)
- [ ] Add `extract_text_from_txt()` to `services.py` (handles `.txt` and `.md`)
- [ ] Add `extract_text_from_html()` to `services.py`
- [ ] Update `DocumentIngestSerializer.validate_file` — replace PDF-only check with supported-extension whitelist
- [ ] Update `perform_create` in `DocumentListCreateView` to dispatch by file extension
- [ ] Unit tests for both extractors

---

### Phase 2 — Office Documents (DOCX, PPTX)

**New extractors in `backend/apps/embeddings/services.py`:**

```python
def extract_text_from_docx(file_bytes: bytes) -> str:
    """Extract text from a .docx Word document, preserving paragraph order."""
    import io
    from docx import Document as DocxDocument  # local import
    doc = DocxDocument(io.BytesIO(file_bytes))
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    text = "\n\n".join(paragraphs)
    if not text:
        raise ValueError("No extractable text found in DOCX file.")
    return text


def extract_text_from_pptx(file_bytes: bytes) -> str:
    """Extract text from all slides in a .pptx file, one slide per block."""
    import io
    from pptx import Presentation  # local import
    prs = Presentation(io.BytesIO(file_bytes))
    slides = []
    for i, slide in enumerate(prs.slides, start=1):
        parts = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    line = para.text.strip()
                    if line:
                        parts.append(line)
        if parts:
            slides.append(f"[Slide {i}]\n" + "\n".join(parts))
    text = "\n\n".join(slides)
    if not text:
        raise ValueError("No extractable text found in PPTX file.")
    return text
```

**Dependencies (`backend/pyproject.toml`):**
```toml
"python-docx>=1.1",
"python-pptx>=1.0",
```

- [ ] Add `python-docx` and `python-pptx` to `pyproject.toml`
- [ ] Run `uv sync`
- [ ] Add `extract_text_from_docx()` to `services.py`
- [ ] Add `extract_text_from_pptx()` to `services.py`
- [ ] Add `.docx`, `.pptx` to the supported-extension whitelist in the serializer
- [ ] Add dispatcher cases in `perform_create`
- [ ] Unit tests for both extractors

---

### Phase 3 — Structured Data (CSV, JSON, JSONL, XLSX)

Structured formats require a conversion strategy: flatten rows/keys into readable text so the chunker can work with natural language units.

**New extractors in `backend/apps/embeddings/services.py`:**

```python
def extract_text_from_csv(file_bytes: bytes, delimiter: str = ",") -> str:
    """Convert CSV/TSV rows to 'key: value' line blocks, one block per row."""
    import csv, io
    reader = csv.DictReader(io.StringIO(file_bytes.decode("utf-8", errors="replace")),
                            delimiter=delimiter)
    rows = []
    for i, row in enumerate(reader):
        lines = [f"{k}: {v}" for k, v in row.items() if v and v.strip()]
        if lines:
            rows.append(f"[Row {i + 1}]\n" + "\n".join(lines))
    text = "\n\n".join(rows)
    if not text:
        raise ValueError("CSV file is empty or contains no data.")
    return text


def extract_text_from_json(file_bytes: bytes) -> str:
    """Recursively flatten JSON/JSONL into key: value text blocks."""
    import json

    def _flatten(obj, prefix="") -> list[str]:
        lines = []
        if isinstance(obj, dict):
            for k, v in obj.items():
                lines.extend(_flatten(v, f"{prefix}{k}: " if not prefix else f"{prefix}.{k}: "))
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                lines.extend(_flatten(item, f"{prefix}[{i}]: "))
        else:
            lines.append(f"{prefix}{obj}")
        return lines

    raw = file_bytes.decode("utf-8", errors="replace").strip()
    # Handle JSONL (newline-delimited JSON)
    if "\n" in raw:
        records = []
        for i, line in enumerate(raw.splitlines()):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                records.append(f"[Record {i + 1}]\n" + "\n".join(_flatten(obj)))
            except json.JSONDecodeError:
                continue
        text = "\n\n".join(records)
    else:
        obj = json.loads(raw)
        text = "\n".join(_flatten(obj))
    if not text:
        raise ValueError("JSON file is empty or contains no data.")
    return text


def extract_text_from_xlsx(file_bytes: bytes) -> str:
    """Convert each sheet of an Excel workbook to row blocks."""
    import io
    import openpyxl  # local import
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    sheets = []
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        headers = None
        rows = []
        for i, row in enumerate(ws.iter_rows(values_only=True)):
            values = [str(v) if v is not None else "" for v in row]
            if i == 0:
                headers = values
                continue
            if not any(v.strip() for v in values):
                continue
            if headers:
                parts = [f"{h}: {v}" for h, v in zip(headers, values) if v.strip()]
            else:
                parts = [v for v in values if v.strip()]
            if parts:
                rows.append("\n".join(parts))
        if rows:
            sheets.append(f"[Sheet: {sheet_name}]\n" + "\n\n".join(rows))
    text = "\n\n".join(sheets)
    if not text:
        raise ValueError("Excel file is empty or contains no data.")
    return text
```

**Dependencies (`backend/pyproject.toml`):**
```toml
"openpyxl>=3.1",
```

(CSV, JSON, JSONL use only stdlib.)

- [ ] Add `openpyxl` to `pyproject.toml`
- [ ] Run `uv sync`
- [ ] Add `extract_text_from_csv()` to `services.py` (also handles `.tsv` by passing `delimiter="\t"`)
- [ ] Add `extract_text_from_json()` to `services.py` (handles `.json` and `.jsonl`)
- [ ] Add `extract_text_from_xlsx()` to `services.py`
- [ ] Extend serializer whitelist: `.csv`, `.tsv`, `.json`, `.jsonl`, `.xlsx`
- [ ] Update `perform_create` dispatcher for all new types
- [ ] Unit tests for all three extractors

---

### Phase 4 — Serializer & View Refactor

Centralise the extension→extractor dispatch map so `serializers.py` and `views.py` stay clean.

**Central dispatch map in `services.py`:**
```python
SUPPORTED_EXTENSIONS: dict[str, str] = {
    ".pdf":   "pdf",
    ".txt":   "txt",
    ".md":    "txt",    # same extractor
    ".html":  "html",
    ".htm":   "html",
    ".docx":  "docx",
    ".pptx":  "pptx",
    ".csv":   "csv",
    ".tsv":   "tsv",
    ".json":  "json",
    ".jsonl": "json",   # same extractor
    ".xlsx":  "xlsx",
}

def extract_text_from_file(name: str, file_bytes: bytes) -> str:
    """Dispatch to the correct extractor based on file extension."""
    ext = name.lower().rsplit(".", 1)[-1]
    ext = f".{ext}"
    kind = SUPPORTED_EXTENSIONS.get(ext)
    if kind is None:
        raise ValueError(f"Unsupported file type: {ext}")
    dispatch = {
        "pdf":  extract_text_from_pdf,
        "txt":  extract_text_from_txt,
        "html": extract_text_from_html,
        "docx": extract_text_from_docx,
        "pptx": extract_text_from_pptx,
        "csv":  extract_text_from_csv,
        "tsv":  lambda b: extract_text_from_csv(b, delimiter="\t"),
        "json": extract_text_from_json,
        "xlsx": extract_text_from_xlsx,
    }
    return dispatch[kind](file_bytes)
```

**Updated serializer `validate_file`:**
```python
def validate_file(self, value):
    max_mb = 50
    if value.size > max_mb * 1024 * 1024:
        raise serializers.ValidationError(f"File must be under {max_mb} MB.")
    from . import services
    ext = "." + value.name.lower().rsplit(".", 1)[-1]
    if ext not in services.SUPPORTED_EXTENSIONS:
        allowed = ", ".join(sorted(services.SUPPORTED_EXTENSIONS))
        raise serializers.ValidationError(
            f"Unsupported file type '{ext}'. Allowed: {allowed}"
        )
    return value
```

**Updated `perform_create` in `views.py`:**
```python
def perform_create(self, serializer):
    data = serializer.validated_data
    if data.get("file"):
        try:
            content = services.extract_text_from_file(
                data["file"].name, data["file"].read()
            )
        except (ValueError, Exception) as exc:
            raise serializers.ValidationError({"file": str(exc)}) from exc
    else:
        content = data["content"]
    services.ingest_document(
        title=data["title"],
        content=content,
        source=data.get("source", ""),
    )
```

- [ ] Add `SUPPORTED_EXTENSIONS` dict to `services.py`
- [ ] Add `extract_text_from_file()` dispatcher to `services.py`
- [ ] Update `DocumentIngestSerializer.validate_file` to use the dispatcher whitelist
- [ ] Update `DocumentListCreateView.perform_create` to use `extract_text_from_file()`
- [ ] Update serializer docstring and error messages
- [ ] Verify `docs/standards/api-contracts.md` reflects accepted file types

---

### Phase 5 — Frontend: Multi-Format File Picker

Update the ingest UI to accept the full list of supported extensions.

- [ ] Update the `accept` attribute on the file input to include all supported extensions:  
  `accept=".pdf,.txt,.md,.html,.htm,.docx,.pptx,.csv,.tsv,.json,.jsonl,.xlsx"`
- [ ] Update the helper text / label to list supported formats
- [ ] Display the detected file type in the upload preview (e.g. "Word Document • 240 KB")
- [ ] Ensure error messages from the backend (unsupported type, empty file) are surfaced in the form

---

## Testing

All new extractor tests live in `backend/apps/embeddings/tests/test_services.py`, appended after the existing `TestExtractTextFromPdf` class. Integration tests go in `backend/apps/embeddings/tests/test_views.py`. No new files are needed.

### Unit tests — `test_services.py`

All extractor unit tests are pure Python (no DB, no network). Use the same class-per-extractor pattern already in the file.

#### `TestExtractTextFromTxt`

```python
class TestExtractTextFromTxt:
    def test_plain_utf8_text(self):
        text = extract_text_from_txt(b"Hello world.")
        assert text == "Hello world."

    def test_markdown_without_front_matter(self):
        text = extract_text_from_txt(b"# Title\n\nSome paragraph.")
        assert "Title" in text
        assert "Some paragraph." in text

    def test_strips_yaml_front_matter(self):
        raw = b"---\ntitle: My Doc\ndate: 2026-01-01\n---\n\nActual content here."
        text = extract_text_from_txt(raw)
        assert "Actual content here." in text
        assert "title: My Doc" not in text

    def test_raises_on_empty_file(self):
        with pytest.raises(ValueError, match="no extractable text"):
            extract_text_from_txt(b"   ")

    def test_non_utf8_bytes_replaced_not_raised(self):
        # latin-1 byte 0xFF is not valid UTF-8 — should not raise
        raw = b"Hello \xff world"
        text = extract_text_from_txt(raw)
        assert "Hello" in text
```

#### `TestExtractTextFromHtml`

```python
class TestExtractTextFromHtml:
    def _html(self, body: str) -> bytes:
        return f"<html><body>{body}</body></html>".encode()

    def test_strips_tags_and_returns_visible_text(self):
        text = extract_text_from_html(self._html("<h1>Title</h1><p>Content.</p>"))
        assert "Title" in text
        assert "Content." in text

    def test_removes_script_and_style_blocks(self):
        raw = self._html("<script>alert('x')</script><style>body{}</style><p>Real.</p>")
        text = extract_text_from_html(raw)
        assert "alert" not in text
        assert "Real." in text

    def test_removes_nav_and_footer(self):
        raw = self._html("<nav>Skip</nav><main><p>Main.</p></main><footer>Footer</footer>")
        text = extract_text_from_html(raw)
        assert "Skip" not in text
        assert "Main." in text

    def test_raises_when_no_visible_text(self):
        with pytest.raises(ValueError, match="No visible text"):
            extract_text_from_html(b"<html><head></head><body></body></html>")
```

#### `TestExtractTextFromDocx`

Uses `io.BytesIO` to build a minimal real `.docx` in memory via `python-docx`.

```python
class TestExtractTextFromDocx:
    def _make_docx(self, paragraphs: list[str]) -> bytes:
        import io
        from docx import Document
        doc = Document()
        for p in paragraphs:
            doc.add_paragraph(p)
        buf = io.BytesIO()
        doc.save(buf)
        return buf.getvalue()

    def test_extracts_paragraphs_in_order(self):
        raw = self._make_docx(["First paragraph.", "Second paragraph."])
        text = extract_text_from_docx(raw)
        assert text.index("First paragraph.") < text.index("Second paragraph.")

    def test_multi_paragraph_joined_by_blank_lines(self):
        raw = self._make_docx(["Para A.", "Para B.", "Para C."])
        text = extract_text_from_docx(raw)
        assert "Para A." in text and "Para B." in text and "Para C." in text

    def test_raises_on_empty_document(self):
        raw = self._make_docx([])
        with pytest.raises(ValueError, match="No extractable text"):
            extract_text_from_docx(raw)
```

#### `TestExtractTextFromPptx`

```python
class TestExtractTextFromPptx:
    def _make_pptx(self, slides: list[list[str]]) -> bytes:
        import io
        from pptx import Presentation
        from pptx.util import Inches
        prs = Presentation()
        blank_layout = prs.slide_layouts[6]
        for texts in slides:
            slide = prs.slides.add_slide(blank_layout)
            txBox = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(6), Inches(4))
            tf = txBox.text_frame
            tf.text = texts[0] if texts else ""
            for t in texts[1:]:
                tf.add_paragraph().text = t
        buf = io.BytesIO()
        prs.save(buf)
        return buf.getvalue()

    def test_extracts_text_from_single_slide(self):
        raw = self._make_pptx([["Slide one content."]])
        text = extract_text_from_pptx(raw)
        assert "Slide one content." in text

    def test_labels_each_slide(self):
        raw = self._make_pptx([["First"], ["Second"]])
        text = extract_text_from_pptx(raw)
        assert "[Slide 1]" in text
        assert "[Slide 2]" in text

    def test_raises_on_empty_presentation(self):
        raw = self._make_pptx([[], []])
        with pytest.raises(ValueError, match="No extractable text"):
            extract_text_from_pptx(raw)
```

#### `TestExtractTextFromCsv`

```python
class TestExtractTextFromCsv:
    def test_multi_row_with_headers(self):
        raw = b"name,age\nAlice,30\nBob,25"
        text = extract_text_from_csv(raw)
        assert "name: Alice" in text
        assert "age: 30" in text
        assert "[Row 1]" in text

    def test_tsv_via_delimiter_argument(self):
        raw = b"city\tcountry\nParis\tFrance\nBerlin\tGermany"
        text = extract_text_from_csv(raw, delimiter="\t")
        assert "city: Paris" in text
        assert "country: France" in text

    def test_raises_on_empty_csv(self):
        with pytest.raises(ValueError, match="empty or contains no data"):
            extract_text_from_csv(b"col1,col2\n")

    def test_skips_blank_rows(self):
        raw = b"k,v\nalpha,1\n,\nbeta,2"
        text = extract_text_from_csv(raw)
        assert "alpha" in text
        assert "beta" in text
```

#### `TestExtractTextFromJson`

```python
class TestExtractTextFromJson:
    def test_flat_json_object(self):
        raw = b'{"title": "Hello", "body": "World"}'
        text = extract_text_from_json(raw)
        assert "title" in text
        assert "Hello" in text

    def test_nested_json_flattened(self):
        raw = b'{"user": {"name": "Alice", "age": 30}}'
        text = extract_text_from_json(raw)
        assert "Alice" in text
        assert "30" in text

    def test_jsonl_produces_labelled_records(self):
        raw = b'{"id": 1, "val": "a"}\n{"id": 2, "val": "b"}'
        text = extract_text_from_json(raw)
        assert "[Record 1]" in text
        assert "[Record 2]" in text

    def test_skips_malformed_jsonl_lines(self):
        raw = b'{"id": 1}\nNOT_JSON\n{"id": 3}'
        text = extract_text_from_json(raw)
        assert "[Record 1]" in text
        assert "NOT_JSON" not in text

    def test_raises_on_empty_content(self):
        with pytest.raises(ValueError, match="empty or contains no data"):
            extract_text_from_json(b'{}')

    def test_raises_on_invalid_json(self):
        with pytest.raises(Exception):
            extract_text_from_json(b'not valid json at all')
```

#### `TestExtractTextFromXlsx`

```python
class TestExtractTextFromXlsx:
    def _make_xlsx(self, sheets: dict[str, list[list]]) -> bytes:
        import io
        import openpyxl
        wb = openpyxl.Workbook()
        first = True
        for name, rows in sheets.items():
            ws = wb.active if first else wb.create_sheet(name)
            if first:
                ws.title = name
                first = False
            for row in rows:
                ws.append(row)
        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()

    def test_single_sheet_with_headers(self):
        raw = self._make_xlsx({"Data": [["name", "score"], ["Alice", 95], ["Bob", 87]]})
        text = extract_text_from_xlsx(raw)
        assert "name: Alice" in text
        assert "score: 95" in text

    def test_labels_each_sheet(self):
        raw = self._make_xlsx({
            "Sheet1": [["k", "v"], ["a", "1"]],
            "Sheet2": [["k", "v"], ["b", "2"]],
        })
        text = extract_text_from_xlsx(raw)
        assert "[Sheet: Sheet1]" in text
        assert "[Sheet: Sheet2]" in text

    def test_raises_on_empty_workbook(self):
        raw = self._make_xlsx({"Empty": [["col1", "col2"]]})
        with pytest.raises(ValueError, match="empty or contains no data"):
            extract_text_from_xlsx(raw)
```

#### `TestExtractTextFromFile` (dispatcher)

```python
class TestExtractTextFromFile:
    @pytest.mark.parametrize("ext", [
        ".txt", ".md", ".html", ".htm",
        ".docx", ".pptx", ".csv", ".tsv",
        ".json", ".jsonl", ".xlsx", ".pdf",
    ])
    def test_supported_extension_does_not_raise_dispatch_error(self, ext, monkeypatch):
        # Patch each extractor to return a fixed string so we only test routing
        monkeypatch.setattr("apps.embeddings.services.extract_text_from_txt", lambda b: "ok")
        monkeypatch.setattr("apps.embeddings.services.extract_text_from_html", lambda b: "ok")
        monkeypatch.setattr("apps.embeddings.services.extract_text_from_docx", lambda b: "ok")
        monkeypatch.setattr("apps.embeddings.services.extract_text_from_pptx", lambda b: "ok")
        monkeypatch.setattr("apps.embeddings.services.extract_text_from_csv", lambda b, **kw: "ok")
        monkeypatch.setattr("apps.embeddings.services.extract_text_from_json", lambda b: "ok")
        monkeypatch.setattr("apps.embeddings.services.extract_text_from_xlsx", lambda b: "ok")
        monkeypatch.setattr("apps.embeddings.services.extract_text_from_pdf", lambda b: "ok")
        result = extract_text_from_file(f"document{ext}", b"fake")
        assert result == "ok"

    def test_unsupported_extension_raises_value_error(self):
        with pytest.raises(ValueError, match="Unsupported file type"):
            extract_text_from_file("malware.exe", b"fake")

    def test_tsv_passes_tab_delimiter(self, monkeypatch):
        captured: dict = {}
        def fake_csv(b, delimiter=","):
            captured["delimiter"] = delimiter
            return "ok"
        monkeypatch.setattr("apps.embeddings.services.extract_text_from_csv", fake_csv)
        extract_text_from_file("data.tsv", b"fake")
        assert captured["delimiter"] == "\t"

    def test_md_uses_txt_extractor(self, monkeypatch):
        called: list = []
        monkeypatch.setattr(
            "apps.embeddings.services.extract_text_from_txt",
            lambda b: called.append(True) or "ok",
        )
        extract_text_from_file("readme.md", b"# Hello")
        assert called
```

---

### Integration tests — `test_views.py`

Add a new `TestDocumentIngestMultiFormat` class after the existing `TestDocumentListCreate`. All tests use the `authenticated_client` fixture and `patch("apps.embeddings.services.embed_texts")` (same pattern as existing view tests).

```python
@pytest.mark.integration
@pytest.mark.django_db
class TestDocumentIngestMultiFormat:
    """End-to-end ingest tests for each supported non-PDF format."""

    def _upload(self, client, filename: str, content: bytes, content_type: str):
        from django.core.files.uploadedfile import SimpleUploadedFile
        f = SimpleUploadedFile(filename, content, content_type=content_type)
        with patch("apps.embeddings.services.embed_texts") as mock_embed:
            mock_embed.return_value = [[0.0] * _DIMS]
            return client.post(
                "/api/embeddings/documents/",
                {"title": "Test", "file": f},
                format="multipart",
            )

    def test_txt_upload_creates_document(self, authenticated_client):
        resp = self._upload(
            authenticated_client, "doc.txt", b"Hello plain text.", "text/plain"
        )
        assert resp.status_code == status.HTTP_201_CREATED

    def test_markdown_upload_creates_document(self, authenticated_client):
        resp = self._upload(
            authenticated_client, "doc.md", b"# Title\n\nContent.", "text/markdown"
        )
        assert resp.status_code == status.HTTP_201_CREATED

    def test_html_upload_creates_document(self, authenticated_client):
        html = b"<html><body><p>Hello HTML.</p></body></html>"
        resp = self._upload(authenticated_client, "doc.html", html, "text/html")
        assert resp.status_code == status.HTTP_201_CREATED

    def test_csv_upload_creates_document(self, authenticated_client):
        resp = self._upload(
            authenticated_client, "data.csv", b"col1,col2\nfoo,bar", "text/csv"
        )
        assert resp.status_code == status.HTTP_201_CREATED

    def test_json_upload_creates_document(self, authenticated_client):
        resp = self._upload(
            authenticated_client, "data.json", b'{"key": "value"}', "application/json"
        )
        assert resp.status_code == status.HTTP_201_CREATED

    def test_unsupported_extension_returns_400(self, authenticated_client):
        resp = self._upload(
            authenticated_client, "virus.exe", b"MZ\x90\x00", "application/octet-stream"
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "Unsupported file type" in str(resp.data)

    def test_empty_txt_returns_400(self, authenticated_client):
        resp = self._upload(authenticated_client, "empty.txt", b"   ", "text/plain")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_file_over_50mb_returns_400(self, authenticated_client):
        from django.core.files.uploadedfile import SimpleUploadedFile
        big = SimpleUploadedFile("big.txt", b"x" * (51 * 1024 * 1024), "text/plain")
        resp = authenticated_client.post(
            "/api/embeddings/documents/",
            {"title": "Big", "file": big},
            format="multipart",
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert "50 MB" in str(resp.data)
```

---

### Run commands

```bash
# All new extractor unit tests (fast, no DB)
cd backend && uv run pytest apps/embeddings/tests/test_services.py -v

# Specific extractor class
cd backend && uv run pytest apps/embeddings/tests/test_services.py::TestExtractTextFromDocx -v

# Integration tests (requires live PostgreSQL + pgvector)
cd backend && uv run pytest apps/embeddings/tests/test_views.py::TestDocumentIngestMultiFormat -m integration -v

# Full suite
just be-test
```

---

### Manual verification

1. Start backend: `just be-dev`
2. Upload each file type via Swagger UI (`/api/schema/swagger-ui/`) or the frontend ingest form
3. Confirm document appears in `/api/embeddings/documents/` with chunks
4. Run a similarity search query against content from each format

---

## Risks & Notes

- **PPTX tables:** `python-pptx` does not expose table cell text through `text_frame` — tables in slides will be silently skipped. Can be addressed in a follow-up with explicit `shape.table` iteration.
- **DOCX tables:** `python-docx` also skips table content in paragraph iteration. Same follow-up applies.
- **Large CSVs / Excel files:** A sheet with thousands of rows will produce a very large text blob before chunking. Consider adding a configurable row limit (e.g. 5,000 rows) as a guard.
- **Encoding:** Non-UTF-8 files (common in legacy CSV/TXT) will use `errors="replace"` — some characters may be mangled. Document this limitation.
- **HTML quality:** Extraction quality depends on document structure. Complex SPAs or heavily JS-rendered pages (uploaded as static HTML) may yield poor results.
- **File size limit:** The current 50 MB limit applies to all formats. PPTX and XLSX can legitimately be large due to embedded images — consider raising the limit for those types or stripping media first.
