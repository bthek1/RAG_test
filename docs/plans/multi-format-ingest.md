# Plan: Multi-Format Document Ingest

**Status:** Draft  
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

### Unit tests (backend)

Each extractor gets its own test in `backend/apps/embeddings/tests/`:

| Extractor | Happy path | Error path |
|---|---|---|
| `extract_text_from_txt` | UTF-8 text, Markdown with front matter | empty file |
| `extract_text_from_html` | HTML with tags stripped | no visible text |
| `extract_text_from_docx` | Multi-paragraph document | empty DOCX |
| `extract_text_from_pptx` | Multi-slide presentation | empty PPTX |
| `extract_text_from_csv` | Multi-row with headers | empty CSV |
| `extract_text_from_json` | Nested JSON, JSONL | malformed JSON |
| `extract_text_from_xlsx` | Multi-sheet workbook | empty sheet |
| `extract_text_from_file` | Each supported extension dispatches | unknown extension → `ValueError` |

### Integration tests (backend)

- `POST /api/embeddings/documents/` with a real `.docx`, `.csv`, and `.html` file upload → `201`, document + chunks created
- Upload unsupported extension (e.g. `.exe`) → `400`, descriptive error message
- Upload empty file → `400`

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
