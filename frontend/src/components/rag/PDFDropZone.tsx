import { useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PDFDropZoneProps {
  value: File | null;
  onChange: (file: File | null) => void;
  error?: string;
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

  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setClientError("Only PDF files are accepted.");
      return;
    }
    setClientError(null);
    onChange(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so the same file can be re-selected after clearing
    e.target.value = "";
  }

  function handleClear() {
    setClientError(null);
    onChange(null);
  }

  const displayError = clientError ?? error;

  return (
    <div className="space-y-1.5">
      <div
        role="button"
        aria-label="Upload a PDF file"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30",
          displayError && "border-destructive",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleInputChange}
          aria-hidden="true"
        />

        {value ? (
          <div className="flex items-center gap-2 text-sm">
            <Paperclip className="h-4 w-4 shrink-0 text-primary" />
            <span className="max-w-[200px] truncate font-medium">
              {value.name}
            </span>
            <span className="text-muted-foreground">
              ({formatBytes(value.size)})
            </span>
            <button
              type="button"
              aria-label="Remove file"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="rounded p-0.5 hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <>
            <Paperclip className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drag &amp; drop a PDF here, or{" "}
              <span className="text-primary underline">click to browse</span>
            </p>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground">Max 50 MB · PDF only</p>

      {displayError && (
        <p className="text-sm text-destructive">{displayError}</p>
      )}
    </div>
  );
}
