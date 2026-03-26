import { useRef, useState } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PDFDropZoneProps {
  value: File[];
  onChange: (files: File[]) => void;
  error?: string;
}

const ACCEPTED_EXTENSIONS = [
  ".pdf",
  ".txt",
  ".md",
  ".html",
  ".htm",
  ".docx",
  ".pptx",
  ".csv",
  ".tsv",
  ".json",
  ".jsonl",
  ".xlsx",
] as const;

const FILE_TYPE_LABELS: Record<string, string> = {
  ".pdf": "PDF",
  ".txt": "Plain Text",
  ".md": "Markdown",
  ".html": "HTML",
  ".htm": "HTML",
  ".docx": "Word Document",
  ".pptx": "PowerPoint",
  ".csv": "CSV",
  ".tsv": "TSV",
  ".json": "JSON",
  ".jsonl": "JSONL",
  ".xlsx": "Excel",
};

function getFileTypeLabel(name: string): string {
  const ext = "." + name.toLowerCase().split(".").pop();
  return FILE_TYPE_LABELS[ext] ?? "Document";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PDFDropZone({ value, onChange, error }: PDFDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  function handleFiles(incoming: FileList | File[]) {
    const arr = Array.from(incoming);
    const valid: File[] = [];
    let badExt: string | null = null;

    for (const file of arr) {
      const ext = "." + file.name.toLowerCase().split(".").pop();
      if (
        !ACCEPTED_EXTENSIONS.includes(
          ext as (typeof ACCEPTED_EXTENSIONS)[number],
        )
      ) {
        badExt = ext;
      } else {
        valid.push(file);
      }
    }

    if (badExt) {
      setClientError(
        `Unsupported file type '${badExt}'. Allowed: ${ACCEPTED_EXTENSIONS.join(", ")}`,
      );
    } else {
      setClientError(null);
    }

    if (valid.length > 0) {
      onChange([...value, ...valid]);
    }
  }

  function removeFile(index: number) {
    const next = value.filter((_, i) => i !== index);
    onChange(next);
    if (next.length === 0) setClientError(null);
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    // Ignore leave events when moving to a child element inside the drop zone
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) handleFiles(e.target.files);
    // Reset so the same file can be re-selected
    e.target.value = "";
  }

  const displayError = clientError ?? error;

  return (
    <div className="space-y-1.5">
      <div
        role="button"
        aria-label="Upload documents"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex min-h-25 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30",
          displayError && "border-destructive",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.html,.htm,.docx,.pptx,.csv,.tsv,.json,.jsonl,.xlsx"
          className="hidden"
          onChange={handleInputChange}
          aria-hidden="true"
        />

        <Paperclip className="h-7 w-7 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Drag &amp; drop files here, or{" "}
          <span className="text-primary underline">click to browse</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Select one or multiple files at once
        </p>
      </div>

      {value.length > 0 && (
        <ul className="space-y-1 rounded-lg border bg-muted/20 p-2">
          {value.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm bg-background"
            >
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate font-medium">
                {file.name}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {getFileTypeLabel(file.name)} · {formatBytes(file.size)}
              </span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(i);
                }}
                className="rounded p-0.5 hover:bg-muted shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Max 50 MB per file · PDF, TXT, Markdown, HTML, DOCX, PPTX, CSV, TSV,
        JSON, JSONL, XLSX
      </p>

      {displayError && (
        <p className="text-sm text-destructive">{displayError}</p>
      )}
    </div>
  );
}
