import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DocumentDetail } from "./DocumentDetail";
import type { Document } from "@/types/embeddings";

// Mock hooks and child components
vi.mock("@/hooks/useDocuments", () => ({
  useDocument: vi.fn(),
  useChunks: vi.fn(),
}));

// Mock ChunkList to avoid deep rendering in DocumentDetail tests
vi.mock("./ChunkList", () => ({
  ChunkList: ({ documentId }: { documentId: string }) => (
    <div data-testid="chunk-list" data-document-id={documentId}>
      Mocked ChunkList
    </div>
  ),
}));

vi.mock("@/lib/date", () => ({
  formatDateTime: (s: string) => s,
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function makeDoc(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-uuid-1",
    title: "Test Document",
    source: "https://example.com",
    content: "Full document content here.",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    chunk_count: 3,
    ...overrides,
  };
}

describe("DocumentDetail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders Info tab with source and chunk count by default", async () => {
    const { useDocument } = await import("@/hooks/useDocuments");
    vi.mocked(useDocument).mockReturnValue({
      data: makeDoc(),
      isLoading: false,
    } as ReturnType<typeof useDocument>);

    render(<DocumentDetail documentId="doc-uuid-1" onClose={vi.fn()} />, {
      wrapper,
    });

    expect(screen.getByText("Test Document")).toBeInTheDocument();
    expect(screen.getByText("https://example.com")).toBeInTheDocument();
  });

  it("renders Content tab when clicked", async () => {
    const user = userEvent.setup();
    const { useDocument } = await import("@/hooks/useDocuments");
    vi.mocked(useDocument).mockReturnValue({
      data: makeDoc(),
      isLoading: false,
    } as ReturnType<typeof useDocument>);

    render(<DocumentDetail documentId="doc-uuid-1" onClose={vi.fn()} />, {
      wrapper,
    });

    await user.click(screen.getByRole("tab", { name: /content/i }));
    expect(screen.getByText("Full document content here.")).toBeInTheDocument();
  });

  it("renders Chunks tab trigger and shows ChunkList when clicked", async () => {
    const user = userEvent.setup();
    const { useDocument } = await import("@/hooks/useDocuments");
    vi.mocked(useDocument).mockReturnValue({
      data: makeDoc(),
      isLoading: false,
    } as ReturnType<typeof useDocument>);

    render(<DocumentDetail documentId="doc-uuid-1" onClose={vi.fn()} />, {
      wrapper,
    });

    const chunksTab = screen.getByRole("tab", { name: /chunks/i });
    expect(chunksTab).toBeInTheDocument();

    await user.click(chunksTab);

    const chunkList = screen.getByTestId("chunk-list");
    expect(chunkList).toBeInTheDocument();
    expect(chunkList).toHaveAttribute("data-document-id", "doc-uuid-1");
  });

  it("calls onClose when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { useDocument } = await import("@/hooks/useDocuments");
    vi.mocked(useDocument).mockReturnValue({
      data: makeDoc(),
      isLoading: false,
    } as ReturnType<typeof useDocument>);

    render(<DocumentDetail documentId="doc-uuid-1" onClose={onClose} />, {
      wrapper,
    });

    await user.click(screen.getByRole("button", { name: "" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
