# Plan: PDF Upload Support

**Status:** In Progress  
**Date:** 2026-03-15  
**Depends on:** `docs/plans/rag-frontend-visualizer.md` (Part 2 — fully complete)

---

## Goal

Allow users to upload PDF files directly from the frontend rather than pasting raw text into a textarea. The backend extracts text from the PDF using `pypdf`, then the existing chunking → embedding → storage pipeline runs unchanged. The user experience changes from "copy-paste your document" to "drop a PDF and click Ingest".

---

## Background

The current `POST /api/embeddings/documents/` endpoint only accepts a JSON body with a `content` string. Users must manually copy-paste text, which is impractical for real documents. PDFs are the dominant format for research papers, technical manuals, and reports — the primary use cases for this RAG system.

The backend already has everything needed after text extraction (`chunk_document`, `embed_texts`, `ingest_document` in `services.py`). The only missing piece is a PDF-to-text extraction step on the backend, combined with a file upload UI on the frontend.

**Design choice — server-side extraction:**  
PDF text is extracted on the **backend** rather than the client. Alternatives like PDF.js on the frontend would add ~1 MB to the bundle, require client-side computation, and produce lower-quality extraction for complex layouts. Server-side extraction is more robust, keeps the frontend lightweight, and centralises the logic.

**Backward compatibility:**  
The existing JSON `{ title, content, source? }` interface continues to work unchanged. The new multipart upload is an **addition**, not a replacement.

---

## Phases

### Phase 1 — Backend: PDF Extraction Service

Add `pypdf` as a backend dependency and a text extraction helper in `services.py`.

**`backend/pyproject.toml`:**
```toml
# Add to [project] dependencies
"pypdf>=4.0",
```

**`backend/apps/embeddings/services.py`** — new function:
```python
import io
from pypdf import PdfReader

def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract plain text from a PDF byte stream.

    Raises ValueError if the PDF produces no extractable text
    (e.g. scanned image-only PDF with no OCR layer).
    """
    reader = PdfReader(io.BytesIO(file_bytes))
    pages = [page.extract_text() or "" for page in reader.pages]
    text = "\n\n".join(p.strip() for p in pages if p.strip())
    if not text:
        raise ValueError(
            "No extractable text found. "
            "The PDF may be scanned or image-only."
        )
    return text
```

- [ ] Add `pypdf>=4.0` to `backend/pyproject.toml` dependencies
- [ ] Run `uv sync` (or `just be-install`) to install
- [ ] Add `extract_text_from_pdf(file_bytes: bytes) -> str` to `services.py`
- [ ] Add `ValueError` guard for image-only PDFs (returns 400 to caller)

---

### Phase 2 — Backend: Serializer + View Update

Add a `DocumentIngestSerializer` that accepts either `content` (plain text) or `file` (PDF upload). Exactly one must be provided.

**`backend/apps/embeddings/serializers.py`** — new serializer:
```python
class DocumentIngestSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=512)
    source = serializers.CharField(max_length=1024, required=False, allow_blank=True)
    content = serializers.CharField(required=False, allow_blank=False)
    file = serializers.FileField(required=False)

    def validate(self, data):
        has_content = bool(data.get("content", "").strip())
        has_file = bool(data.get("file"))
        if not has_content and not has_file:
            raise serializers.ValidationError(
                "Provide either 'content' (text) or 'file' (PDF)."
            )
        if has_content and has_file:
            raise serializers.ValidationError(
                "Provide 'content' or 'file', not both."
            )
        return data
```

**`backend/apps/embeddings/views.py`** — update `DocumentListCreateView`:
```python
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

class DocumentListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    # Accept both JSON (text ingest) and multipart (PDF upload)
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return DocumentIngestSerializer   # ← new
        return DocumentListSerializer

    def perform_create(self, serializer):
        data = serializer.validated_data
        if data.get("file"):
            try:
                content = services.extract_text_from_pdf(data["file"].read())
            except ValueError as exc:
                raise serializers.ValidationError({"file": str(exc)}) from exc
        else:
            content = data["content"]

        services.ingest_document(
            title=data["title"],
            content=content,
            source=data.get("source", ""),
        )
```

File size validation — add a max-size check (50 MB) in `DocumentIngestSerializer.validate_file`:
```python
def validate_file(self, value):
    max_mb = 50
    if value.size > max_mb * 1024 * 1024:
        raise serializers.ValidationError(f"PDF must be under {max_mb} MB.")
    if not value.name.lower().endswith(".pdf"):
        raise serializers.ValidationError("Only PDF files are accepted.")
    return value
```

**API contract update** — `docs/standards/api-contracts.md`:  
Document the new multipart form variant for `POST /api/embeddings/documents/`.

- [ ] Add `DocumentIngestSerializer` to `serializers.py`
- [ ] Update `DocumentListCreateView` with `parser_classes` and new `perform_create` logic
- [ ] Add `validate_file` with size (50 MB) and extension checks
- [ ] Update `docs/standards/api-contracts.md` to document multipart variant
- [ ] Backend unit tests: valid PDF upload, image-only PDF (400), file too large (400), file + content both present (400), neither present (400)

---

### Phase 3 — Frontend: Types + API Layer

Update the TypeScript types and the `ingestDocument` API function to support `FormData` (multipart) for PDFs alongside the existing JSON path.

**`frontend/src/types/embeddings.ts`** — extend `IngestDocumentRequest`:
```typescript
export interface IngestDocumentRequest {
  title: string
  content?: string      // was required — now optional (mutually exclusive with file)
  source?: string
  file?: File           // new — PDF file object
}
```

**`frontend/src/api/embeddings.ts`** — update `ingestDocument`:
```typescript
export const ingestDocument = (data: IngestDocumentRequest) => {
  if (data.file) {
    const form = new FormData()
    form.append('title', data.title)
    form.append('file', data.file)
    if (data.source) form.append('source', data.source)
    return apiClient.post<Document>('/api/embeddings/documents/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  }
  // Plain-text path — unchanged
  return apiClient.post<Document>('/api/embeddings/documents/', {
    title: data.title,
    content: data.content,
    source: data.source,
  })
}
```

**`frontend/src/schemas/embeddings.ts`** — update `ingestDocumentSchema`:
```typescript
// Base fields common to both modes
const baseIngestSchema = z.object({
  title: z.string().min(1, 'Title is required').max(512),
  source: z.string().optional(),
})

export const ingestTextSchema = baseIngestSchema.extend({
  mode: z.literal('text'),
  content: z.string().min(1, 'Content is required'),
})

export const ingestFileSchema = baseIngestSchema.extend({
  mode: z.literal('file'),
  file: z.instanceof(File, { message: 'A PDF file is required' }),
})

export const ingestDocumentSchema = z.discriminatedUnion('mode', [
  ingestTextSchema,
  ingestFileSchema,
])

export type IngestDocumentFormData = z.infer<typeof ingestDocumentSchema>
```

- [ ] Update `IngestDocumentRequest` in `frontend/src/types/embeddings.ts`
- [ ] Update `ingestDocument()` in `frontend/src/api/embeddings.ts` to send `FormData` when `file` is present
- [ ] Replace `ingestDocumentSchema` in `frontend/src/schemas/embeddings.ts` with discriminated union
- [ ] Unit tests: `ingestDocumentSchema` validates text mode and file mode, rejects empty content

---

### Phase 4 — Frontend: IngestDocumentForm UI

Update `frontend/src/components/rag/IngestDocumentForm.tsx` to let users choose between "Paste Text" and "Upload PDF". The existing step progress indicator (Chunking → Embedding → Storing) is preserved.

**Layout:**

```
Title:   [________________]
Source:  [________________]  (optional)

Input mode:
  ┌──────────────┬──────────────────┐
  │  📄 Paste Text │  📎 Upload PDF   │  ← Tabs (shadcn Tabs)
  └──────────────┴──────────────────┘

  [Paste Text tab]
  Content: [                          ]
            [                          ]
            [  large Textarea           ]

  [Upload PDF tab]
  ┌─────────────────────────────────────┐
  │                                     │
  │   Drag & drop a PDF here, or        │
  │         click to browse             │
  │                                     │
  │   📎 report.pdf  (2.4 MB)  [✕]      │  ← shown after selection
  └─────────────────────────────────────┘
  Max 50 MB · PDF only

[ Ingest → ]
```

**Implementation notes:**

- Use shadcn/ui `Tabs` to switch between "Paste Text" and "Upload PDF" modes
- The `mode` field drives the Zod discriminated union — set via `form.setValue('mode', 'text' | 'file')`
- Drop zone: a `<div>` with `onDragOver`, `onDrop` handlers and an hidden `<input type="file" accept=".pdf" />`
- When a file is chosen, show the filename + formatted size and a clear button (`✕`)
- If the user switches tabs, reset the opposite field (clear `content` when switching to file, clear `file` when switching to text) to avoid sending both
- The existing `IngestStep` progress indicator and mutation wiring remain unchanged
- Error handling: display the backend `file` validation error inline below the drop zone

**New helper component — `PDFDropZone.tsx`** (co-located in `src/components/rag/`):
- Accepts `value: File | null`, `onChange: (file: File | null) => void`, `error?: string`
- Drag-and-drop + click-to-browse
- Validates `.pdf` extension client-side before setting (shows inline error for wrong type)
- Accessible: `role="button"`, `aria-label`, keyboard-activatable

- [ ] Create `frontend/src/components/rag/PDFDropZone.tsx`
- [ ] Update `frontend/src/components/rag/IngestDocumentForm.tsx` to add mode tabs and wire `PDFDropZone`
- [ ] Add `PDFDropZone.test.tsx` — renders, accepts PDF file, rejects non-PDF, clears on ✕ click

---

## Testing

### Backend unit tests
- `test_pdf_upload_valid` — POST multipart with a real single-page PDF; expect 201 + chunk_count ≥ 1
- `test_pdf_upload_image_only` — POST with an image-only PDF; expect 400 with message about no text
- `test_pdf_upload_too_large` — POST with a file > 50 MB; expect 400
- `test_pdf_upload_wrong_type` — POST a `.txt` file with `Content-Type: application/pdf`; expect 400
- `test_pdf_upload_with_content` — POST both `file` and `content`; expect 400
- `test_text_ingest_still_works` — existing JSON ingest path unchanged; expect 201
- `extract_text_from_pdf` unit tests: valid PDF, empty PDF bytes, image-only PDF

### Frontend unit tests
- `ingestDocumentSchema` — text mode valid, file mode valid, file mode rejects missing file
- `PDFDropZone` — renders drop hint, calls `onChange` on valid PDF drop, rejects non-PDF
- `ingestDocument` API function — sends `FormData` when `file` present, sends JSON when only `content`

### Manual verification
1. Start full stack (`just up` or `just be-dev` + `just fe-dev`)
2. Log in, navigate to `/rag/documents`
3. Open the Ingest form, switch to "Upload PDF" tab
4. Drag a PDF onto the drop zone; verify filename + size shown
5. Click "Ingest", verify step indicator cycles (Chunking → Embedding → Storing)
6. Confirm document appears in the list with a non-zero `chunk_count`
7. Open the document detail and verify content field contains readable extracted text
8. Try uploading a non-PDF; verify inline client-side error
9. Try uploading a PDF > 50 MB; verify backend 400 error surfaces in the UI
10. Verify the "Paste Text" tab still works as before

---

## Risks & Notes

- **Image-only PDFs:** Scanned PDFs without an OCR text layer will produce no extractable text. The backend returns a clear 400 error. An OCR step (e.g. via `pytesseract`) is out of scope for this plan.
- **`pypdf` vs `pdfminer.six`:** `pypdf` is chosen for its pure-Python install with no system dependencies. `pdfminer.six` offers better layout analysis for complex multi-column documents but requires more setup. A future plan can swap extractors.
- **Memory:** Large PDFs are read into memory as bytes. For production, consider streaming directly to `pypdf` from `request.FILES` without `.read()`-ing the whole file first. Acceptable at 50 MB limit for now.
- **Content-Type sniffing:** The `validate_file` extension check is a first-layer guard; the backend does not do deep MIME sniffing. `pypdf` will raise its own exception if the bytes are not a valid PDF, which should be caught and returned as a 400.
- **Existing `ingestDocumentSchema`:** The discriminated union is a breaking change to the schema's type signature. Any other consumers of `ingestDocumentSchema` (tests, other forms) must be updated.
