import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChunkList } from "./ChunkList";
import type { Chunk } from "@/types/embeddings";

vi.mock("@/hooks/useDocuments", () => ({
  useChunks: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function makeChunk(index: number, content: string): Chunk {
  return {
    id: `chunk-${index}`,
    document: "doc-1",
    document_title: "Test Doc",
    content,
    chunk_index: index,
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("ChunkList", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders skeletons while loading", async () => {
    const { useChunks } = await import("@/hooks/useDocuments");
    vi.mocked(useChunks).mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
    } as ReturnType<typeof useChunks>);

    render(<ChunkList documentId="doc-1" />, { wrapper });

    // Skeletons are rendered as divs with animate-pulse class via Skeleton
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders chunk cards with summary stat once loaded", async () => {
    const { useChunks } = await import("@/hooks/useDocuments");
    const chunks = [
      makeChunk(0, "Alpha content here."),
      makeChunk(1, "Beta content here too."),
    ];
    vi.mocked(useChunks).mockReturnValue({
      isLoading: false,
      isError: false,
      data: chunks,
    } as ReturnType<typeof useChunks>);

    render(<ChunkList documentId="doc-1" />, { wrapper });

    // Summary line "2 chunks · avg X chars"
    expect(screen.getByText(/chunks/)).toBeInTheDocument();
    expect(screen.getByText(/avg/)).toBeInTheDocument();
    // Both chunk contents visible
    expect(screen.getByText(/Alpha content here/)).toBeInTheDocument();
    expect(screen.getByText(/Beta content here too/)).toBeInTheDocument();
  });

  it("renders error Alert on query error", async () => {
    const { useChunks } = await import("@/hooks/useDocuments");
    vi.mocked(useChunks).mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
    } as ReturnType<typeof useChunks>);

    render(<ChunkList documentId="doc-1" />, { wrapper });

    expect(screen.getByText(/failed to load chunks/i)).toBeInTheDocument();
  });

  it("renders empty state when chunks = []", async () => {
    const { useChunks } = await import("@/hooks/useDocuments");
    vi.mocked(useChunks).mockReturnValue({
      isLoading: false,
      isError: false,
      data: [],
    } as ReturnType<typeof useChunks>);

    render(<ChunkList documentId="doc-1" />, { wrapper });

    expect(screen.getByText(/no chunks found/i)).toBeInTheDocument();
  });
});
