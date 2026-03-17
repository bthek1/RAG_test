import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ChunkCard } from "./ChunkCard";
import type { Chunk } from "@/types/embeddings";

function makeChunk(overrides: Partial<Chunk> = {}): Chunk {
  return {
    id: "aaaaaaaa-0000-0000-0000-000000000000",
    document: "dddddddd-0000-0000-0000-000000000000",
    document_title: "My Document",
    content: "This is the chunk content. It has multiple words to test rendering.",
    chunk_index: 2,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("ChunkCard", () => {
  it("renders rank and content", () => {
    render(<ChunkCard chunk={makeChunk()} />);
    expect(screen.getByText(/#3/)).toBeInTheDocument();
    expect(
      screen.getByText(/This is the chunk content/),
    ).toBeInTheDocument();
  });

  it("renders char count", () => {
    const chunk = makeChunk({ content: "Hello" });
    render(<ChunkCard chunk={chunk} />);
    expect(screen.getByText(/5 chars/)).toBeInTheDocument();
  });

  it("shows document title when showDocument=true and document_title is present", () => {
    render(<ChunkCard chunk={makeChunk()} showDocument />);
    expect(screen.getByText("My Document")).toBeInTheDocument();
  });

  it("hides document title when showDocument=false", () => {
    render(<ChunkCard chunk={makeChunk()} showDocument={false} />);
    expect(screen.queryByText("My Document")).not.toBeInTheDocument();
  });

  it("hides document title when document_title is absent", () => {
    render(<ChunkCard chunk={makeChunk({ document_title: undefined })} showDocument />);
    expect(screen.queryByText("My Document")).not.toBeInTheDocument();
  });

  it("shows 'N / M' position when totalChunks is provided", () => {
    render(<ChunkCard chunk={makeChunk()} totalChunks={12} />);
    // chunk_index=2 → position 3
    expect(screen.getByText(/#3 \/ 12/)).toBeInTheDocument();
  });

  it("shows 'N' only when totalChunks is omitted", () => {
    render(<ChunkCard chunk={makeChunk()} />);
    expect(screen.getByText(/#3/)).toBeInTheDocument();
    expect(screen.queryByText(/\/ /)).not.toBeInTheDocument();
  });

  it("shows similarity bar and percentage when distance is present", () => {
    render(<ChunkCard chunk={makeChunk({ distance: 0.12 })} />);
    expect(screen.getByText(/% similar/)).toBeInTheDocument();
    expect(screen.getByText(/d=0\.120/)).toBeInTheDocument();
  });

  it("hides similarity bar when distance is absent", () => {
    render(<ChunkCard chunk={makeChunk({ distance: undefined })} />);
    expect(screen.queryByText(/% similar/)).not.toBeInTheDocument();
  });

  it("expand/collapse toggles content and aria-expanded", async () => {
    const user = userEvent.setup();
    render(<ChunkCard chunk={makeChunk()} />);
    const toggle = screen.getByRole("button", { name: /show more/i });

    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /show less/i })).toBeInTheDocument();
  });

  it("is expanded by default when defaultExpanded=true", () => {
    render(<ChunkCard chunk={makeChunk()} defaultExpanded />);
    expect(
      screen.getByRole("button", { name: /show less/i }),
    ).toBeInTheDocument();
  });
});
