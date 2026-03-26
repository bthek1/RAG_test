import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DocumentCard } from "./DocumentCard";
import type { DocumentListItem } from "@/types/embeddings";

function makeDoc(overrides: Partial<DocumentListItem> = {}): DocumentListItem {
  return {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    title: "My Test Document",
    source: "https://example.com/doc",
    created_at: "2026-01-15T10:00:00Z",
    updated_at: "2026-01-15T10:00:00Z",
    chunk_count: 7,
    ...overrides,
  };
}

describe("DocumentCard", () => {
  it("renders title, source, chunk count badge, and created_at", () => {
    render(
      <DocumentCard doc={makeDoc()} onSelect={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByText("My Test Document")).toBeInTheDocument();
    expect(screen.getByText("https://example.com/doc")).toBeInTheDocument();
    expect(screen.getByText(/7 chunk/)).toBeInTheDocument();
    // relative date — just check something is rendered
    expect(screen.getByText(/ago/)).toBeInTheDocument();
  });

  it("omits source element when source is not provided", () => {
    render(
      <DocumentCard
        doc={makeDoc({ source: "" })}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(
      screen.queryByText("https://example.com/doc"),
    ).not.toBeInTheDocument();
  });

  it("omits source element when source is undefined", () => {
    const doc = makeDoc();
    // @ts-expect-error testing missing source
    delete doc.source;
    render(<DocumentCard doc={doc} onSelect={vi.fn()} onDelete={vi.fn()} />);
    expect(
      screen.queryByText("https://example.com/doc"),
    ).not.toBeInTheDocument();
  });

  it("clicking the card fires onSelect with the doc id", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DocumentCard doc={makeDoc()} onSelect={onSelect} onDelete={vi.fn()} />,
    );
    await user.click(screen.getByText("My Test Document"));
    expect(onSelect).toHaveBeenCalledWith(
      "aaaaaaaa-0000-0000-0000-000000000001",
    );
  });

  it("clicking the delete button fires onDelete with the doc id and does not fire onSelect", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    render(
      <DocumentCard doc={makeDoc()} onSelect={onSelect} onDelete={onDelete} />,
    );
    const deleteBtn = screen.getByRole("button");
    await user.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith(
      "aaaaaaaa-0000-0000-0000-000000000001",
    );
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("delete button is disabled when isDeleting is true", () => {
    render(
      <DocumentCard
        doc={makeDoc()}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        isDeleting
      />,
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("applies selected ring class when isSelected is true", () => {
    const { container } = render(
      <DocumentCard
        doc={makeDoc()}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        isSelected
      />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/ring-2/);
  });

  it("uses plural 'chunks' label for chunk_count > 1", () => {
    render(
      <DocumentCard
        doc={makeDoc({ chunk_count: 3 })}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("3 chunks")).toBeInTheDocument();
  });

  it("uses singular 'chunk' label for chunk_count = 1", () => {
    render(
      <DocumentCard
        doc={makeDoc({ chunk_count: 1 })}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("1 chunk")).toBeInTheDocument();
  });
});
