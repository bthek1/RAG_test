import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Accordion } from "@/components/ui/accordion";
import { SourceCitation } from "./SourceCitation";
import type { RAGSource } from "@/types/embeddings";

function makeSource(overrides: Partial<RAGSource> = {}): RAGSource {
  return {
    chunk_id: "cccccccc-0000-0000-0000-000000000001",
    document_title: "Annual Report",
    content: "The company achieved record revenue this quarter.",
    distance: 0.08,
    ...overrides,
  };
}

describe("SourceCitation", () => {
  it("renders document_title and similarity badge in accordion trigger", () => {
    render(
      <Accordion type="multiple">
        <SourceCitation source={makeSource()} index={0} />
      </Accordion>,
    );
    expect(screen.getByText("Annual Report")).toBeInTheDocument();
    // similarity badge shows a percentage
    expect(screen.getByText(/\d+%/)).toBeInTheDocument();
  });

  it("expands to show content and footer metadata", async () => {
    const user = userEvent.setup();
    render(
      <Accordion type="multiple">
        <SourceCitation source={makeSource()} index={0} />
      </Accordion>,
    );

    const trigger = screen.getByText("Annual Report");
    await user.click(trigger);

    expect(
      screen.getByText(/The company achieved record revenue/),
    ).toBeInTheDocument();

    // distance and chunk ID in footer
    expect(screen.getByText(/0\.0800/)).toBeInTheDocument();
    expect(screen.getByText(/cccccccc/)).toBeInTheDocument();
  });

  it("renders 'View in document' button that is disabled", async () => {
    const user = userEvent.setup();
    render(
      <Accordion type="multiple">
        <SourceCitation source={makeSource()} index={0} />
      </Accordion>,
    );

    await user.click(screen.getByText("Annual Report"));

    const viewBtn = screen.getByRole("button", { name: /view in document/i });
    expect(viewBtn).toBeDisabled();
  });
});
