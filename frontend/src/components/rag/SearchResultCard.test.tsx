import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SearchResultCard } from "./SearchResultCard";
import type { Chunk } from "@/types/embeddings";

function makeChunk(overrides: Partial<Chunk> = {}): Chunk {
  return {
    id: "bbbbbbbb-0000-0000-0000-000000000000",
    document: "dddddddd-0000-0000-0000-000000000000",
    content: "Search result content with enough text to test the expand toggle.",
    chunk_index: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("SearchResultCard", () => {
  it("renders rank badge", () => {
    render(<SearchResultCard chunk={makeChunk()} rank={1} />);
    expect(screen.getByText("#1")).toBeInTheDocument();
  });

  it("shows document title when document_title is present", () => {
    render(
      <SearchResultCard chunk={makeChunk({ document_title: "My Report" })} rank={1} />,
    );
    expect(screen.getByText("My Report")).toBeInTheDocument();
  });

  it("omits document title when document_title is absent", () => {
    render(<SearchResultCard chunk={makeChunk({ document_title: undefined })} rank={1} />);
    expect(screen.queryByText("My Report")).not.toBeInTheDocument();
  });

  it("renders similarity progress and percentage when distance is present", () => {
    render(<SearchResultCard chunk={makeChunk({ distance: 0.1 })} rank={1} />);
    expect(screen.getByText(/% similar/)).toBeInTheDocument();
    expect(screen.getByText(/d=0\.100/)).toBeInTheDocument();
  });

  it("omits similarity row when distance is absent", () => {
    render(<SearchResultCard chunk={makeChunk({ distance: undefined })} rank={1} />);
    expect(screen.queryByText(/% similar/)).not.toBeInTheDocument();
  });

  it("expand/collapse toggles aria-expanded", async () => {
    const user = userEvent.setup();
    render(<SearchResultCard chunk={makeChunk()} rank={1} />);

    const toggle = screen.getByRole("button", { name: /show more/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /show less/i })).toBeInTheDocument();
  });

  it("shows char count", () => {
    const chunk = makeChunk({ content: "Hello world" });
    render(<SearchResultCard chunk={chunk} rank={1} />);
    expect(screen.getByText(/11 chars/)).toBeInTheDocument();
  });
});
