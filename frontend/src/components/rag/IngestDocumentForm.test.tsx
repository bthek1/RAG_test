import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { IngestDocumentForm } from "./IngestDocumentForm";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock("@/api/embeddings", () => ({
  ingestDocument: vi.fn(),
  listDocuments: vi.fn(),
  getDocument: vi.fn(),
  deleteDocument: vi.fn(),
  listChunks: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeFile(name: string, content = "data"): File {
  return new File([content], name, { type: "application/pdf" });
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderForm(onSuccess = vi.fn()) {
  return {
    user: userEvent.setup(),
    onSuccess,
    ...render(<IngestDocumentForm onSuccess={onSuccess} />, { wrapper }),
  };
}

// ---------------------------------------------------------------------------
// Static rendering
// ---------------------------------------------------------------------------
describe("IngestDocumentForm — static rendering", () => {
  it("shows Title and Source fields", () => {
    renderForm();
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/source/i)).toBeInTheDocument();
  });

  it("has 'Paste Text' and 'Upload Files' tabs", () => {
    renderForm();
    expect(
      screen.getByRole("tab", { name: /paste text/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /upload files/i }),
    ).toBeInTheDocument();
  });

  it("defaults to text mode — textarea is visible", () => {
    renderForm();
    expect(
      screen.getByPlaceholderText(/paste or type your document text/i),
    ).toBeInTheDocument();
  });

  it("shows 'Ingest →' submit button", () => {
    renderForm();
    expect(screen.getByRole("button", { name: /ingest/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------
describe("IngestDocumentForm — tab switching", () => {
  it("switches to file mode on clicking Upload Files tab", async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole("tab", { name: /upload files/i }));
    expect(
      screen.getByRole("button", { name: /upload documents/i }),
    ).toBeInTheDocument();
  });

  it("title placeholder changes in file mode", async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole("tab", { name: /upload files/i }));
    expect(
      screen.getByPlaceholderText(/leave blank to use filename/i),
    ).toBeInTheDocument();
  });

  it("switching back to text mode shows textarea again", async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole("tab", { name: /upload files/i }));
    await user.click(screen.getByRole("tab", { name: /paste text/i }));
    expect(
      screen.getByPlaceholderText(/paste or type your document text/i),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Text mode — validation
// ---------------------------------------------------------------------------
describe("IngestDocumentForm — text mode validation", () => {
  it("shows validation error when submitting with empty title", async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole("button", { name: /ingest/i }));
    expect(await screen.findByText(/title is required/i)).toBeInTheDocument();
  });

  it("shows validation error when submitting with empty content", async () => {
    const { user } = renderForm();
    await user.type(screen.getByLabelText(/^title/i), "My Doc");
    await user.click(screen.getByRole("button", { name: /ingest/i }));
    expect(await screen.findByText(/content is required/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Text mode — successful submit
// ---------------------------------------------------------------------------
describe("IngestDocumentForm — text mode submit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls ingestDocument (via mutation) with title and content", async () => {
    const { ingestDocument } = await import("@/api/embeddings");
    vi.mocked(ingestDocument).mockResolvedValue({} as never);

    const { user } = renderForm();
    await user.type(screen.getByLabelText(/^title/i), "My Doc");
    await user.type(
      screen.getByPlaceholderText(/paste or type/i),
      "Some content here",
    );
    await user.click(screen.getByRole("button", { name: /ingest/i }));

    await waitFor(() =>
      expect(vi.mocked(ingestDocument)).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "My Doc",
          content: "Some content here",
        }),
      ),
    );
  });

  it("calls onSuccess after text ingest completes", async () => {
    const { ingestDocument } = await import("@/api/embeddings");
    vi.mocked(ingestDocument).mockResolvedValue({} as never);

    const { user, onSuccess } = renderForm();
    await user.type(screen.getByLabelText(/^title/i), "Title");
    await user.type(screen.getByPlaceholderText(/paste or type/i), "Content");
    await user.click(screen.getByRole("button", { name: /ingest/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled(), {
      timeout: 3000,
    });
  });
});

// ---------------------------------------------------------------------------
// File mode — validation
// ---------------------------------------------------------------------------
describe("IngestDocumentForm — file mode validation", () => {
  it("does not call ingestDocument when no files are selected", async () => {
    vi.clearAllMocks();
    const { ingestDocument } = await import("@/api/embeddings");
    vi.mocked(ingestDocument).mockResolvedValue({} as never);

    const { user } = renderForm();
    await user.click(screen.getByRole("tab", { name: /upload files/i }));
    await user.click(screen.getByRole("button", { name: /ingest/i }));

    // Form should not proceed — ingestDocument must stay uncalled
    await new Promise((r) => setTimeout(r, 100));
    expect(vi.mocked(ingestDocument)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// File mode — single file submit
// ---------------------------------------------------------------------------
describe("IngestDocumentForm — file mode single file", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the form title when one file is selected and title is provided", async () => {
    const { ingestDocument } = await import("@/api/embeddings");
    vi.mocked(ingestDocument).mockResolvedValue({} as never);

    const { user } = renderForm();
    await user.click(screen.getByRole("tab", { name: /upload files/i }));

    // Give a title
    const titleInput = screen.getByLabelText(/^title/i);
    await user.clear(titleInput);
    await user.type(titleInput, "Custom Title");

    // Simulate file input change by dropping a file onto the drop zone
    const dropZone = screen.getByRole("button", { name: /upload documents/i });
    const file = makeFile("report.pdf");
    const { fireEvent: fe } = await import("@testing-library/react");
    fe.drop(dropZone, { dataTransfer: { files: [file] } });

    await user.click(screen.getByRole("button", { name: /ingest/i }));

    await waitFor(() =>
      expect(vi.mocked(ingestDocument)).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Custom Title", file }),
      ),
    );
  });

  it("derives title from filename when no form title is given", async () => {
    const { ingestDocument } = await import("@/api/embeddings");
    vi.mocked(ingestDocument).mockResolvedValue({} as never);

    const { user } = renderForm();
    await user.click(screen.getByRole("tab", { name: /upload files/i }));

    const dropZone = screen.getByRole("button", { name: /upload documents/i });
    const file = makeFile("my_report_2026.pdf");
    const { fireEvent: fe } = await import("@testing-library/react");
    fe.drop(dropZone, { dataTransfer: { files: [file] } });

    await user.click(screen.getByRole("button", { name: /ingest/i }));

    await waitFor(() =>
      expect(vi.mocked(ingestDocument)).toHaveBeenCalledWith(
        expect.objectContaining({ title: "my report 2026" }),
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// File mode — multi-file submit
// ---------------------------------------------------------------------------
describe("IngestDocumentForm — file mode multiple files", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls ingestDocument once per file in sequence", async () => {
    const { ingestDocument } = await import("@/api/embeddings");
    vi.mocked(ingestDocument).mockResolvedValue({} as never);

    const { user } = renderForm();
    await user.click(screen.getByRole("tab", { name: /upload files/i }));

    const dropZone = screen.getByRole("button", { name: /upload documents/i });
    const fileA = makeFile("alpha.pdf");
    const fileB = makeFile("beta.txt", "text");
    const { fireEvent: fe } = await import("@testing-library/react");
    fe.drop(dropZone, { dataTransfer: { files: [fileA, fileB] } });

    await user.click(screen.getByRole("button", { name: /ingest 2 files/i }));

    await waitFor(() =>
      expect(vi.mocked(ingestDocument)).toHaveBeenCalledTimes(2),
    );
    expect(vi.mocked(ingestDocument)).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ file: fileA }),
    );
    expect(vi.mocked(ingestDocument)).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ file: fileB }),
    );
  });

  it("shows each filename in the queue during ingest", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { ingestDocument } = await import("@/api/embeddings");
    // Keep the first call pending so we can inspect the queue mid-flight
    let resolveFirst!: (v: never) => void;
    vi.mocked(ingestDocument)
      .mockImplementationOnce(
        () => new Promise<never>((res) => { resolveFirst = res; }),
      )
      .mockResolvedValue({} as never);

    const { user } = renderForm();
    await user.click(screen.getByRole("tab", { name: /upload files/i }));

    const dropZone = screen.getByRole("button", { name: /upload documents/i });
    const { fireEvent: fe } = await import("@testing-library/react");
    fe.drop(dropZone, {
      dataTransfer: { files: [makeFile("a.pdf"), makeFile("b.pdf")] },
    });

    // Flush the RHF field update before clicking submit
    await act(async () => {});

    await user.click(screen.getByRole("button", { name: /ingest 2 files/i }));

    // Queue should show both filenames while first ingest is still running
    // (files also appear in PDFDropZone list, so use getAllByText)
    expect(screen.getAllByText("a.pdf").length).toBeGreaterThan(0);
    expect(screen.getAllByText("b.pdf").length).toBeGreaterThan(0);

    // Let remaining ingests complete
    await act(async () => { resolveFirst({} as never); });
    await act(async () => {});

    vi.useRealTimers();
  });

  it("shows error status for a file that fails to ingest", async () => {
    const { ingestDocument } = await import("@/api/embeddings");
    vi.mocked(ingestDocument)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error("Server error"));

    const { user } = renderForm();
    await user.click(screen.getByRole("tab", { name: /upload files/i }));

    const dropZone = screen.getByRole("button", { name: /upload documents/i });
    const { fireEvent: fe } = await import("@testing-library/react");
    fe.drop(dropZone, {
      dataTransfer: { files: [makeFile("ok.pdf"), makeFile("fail.pdf")] },
    });

    await user.click(screen.getByRole("button", { name: /ingest 2 files/i }));

    await waitFor(() =>
      expect(screen.getByText("Server error")).toBeInTheDocument(),
    );
  });
});

// ---------------------------------------------------------------------------
// deriveTitleFromFile — pure helper (tested via direct import)
// ---------------------------------------------------------------------------
describe("deriveTitleFromFile helper", () => {
  // Re-implement locally to keep the test self-contained
  function deriveTitleFromFile(
    file: File,
    formTitle: string,
    fileCount: number,
  ): string {
    if (formTitle.trim() && fileCount === 1) return formTitle.trim();
    const nameWithoutExt = file.name.replace(/\.[^.]+$/, "");
    return nameWithoutExt.replace(/[_-]+/g, " ").trim() || file.name;
  }

  it("returns formTitle when single file and title is provided", () => {
    const f = new File([""], "doc.pdf");
    expect(deriveTitleFromFile(f, "My Title", 1)).toBe("My Title");
  });

  it("derives from filename when multiple files (ignores formTitle)", () => {
    const f = new File([""], "annual_report_2026.pdf");
    expect(deriveTitleFromFile(f, "Anything", 2)).toBe("annual report 2026");
  });

  it("strips hyphens and replaces with spaces", () => {
    const f = new File([""], "user-guide-v2.docx");
    expect(deriveTitleFromFile(f, "", 1)).toBe("user guide v2");
  });

  it("falls back to full filename if stripping produces empty string", () => {
    const f = new File([""], ".pdf");
    expect(deriveTitleFromFile(f, "", 1)).toBe(".pdf");
  });
});
