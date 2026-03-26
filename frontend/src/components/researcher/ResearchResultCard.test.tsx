import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ResearchResultCard } from "@/components/researcher/ResearchResultCard";

const result = {
  title: "Example Article",
  url: "https://example.com",
  snippet: "A short summary.",
  scraped_text: "Full scraped content here.",
};

describe("ResearchResultCard", () => {
  it("renders title, URL, and snippet", () => {
    render(<ResearchResultCard result={result} rank={1} />);
    expect(screen.getByText("Example Article")).toBeInTheDocument();
    expect(screen.getByText("https://example.com")).toBeInTheDocument();
    expect(screen.getByText("A short summary.")).toBeInTheDocument();
  });

  it("renders the rank badge", () => {
    render(<ResearchResultCard result={result} rank={3} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("hides scraped text by default", () => {
    render(<ResearchResultCard result={result} rank={1} />);
    expect(
      screen.queryByText("Full scraped content here."),
    ).not.toBeInTheDocument();
  });

  it("expands and collapses scraped text on button click", async () => {
    render(<ResearchResultCard result={result} rank={1} />);
    await userEvent.click(
      screen.getByRole("button", { name: /show scraped text/i }),
    );
    expect(
      screen.getByText("Full scraped content here."),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /hide scraped text/i }),
    );
    expect(
      screen.queryByText("Full scraped content here."),
    ).not.toBeInTheDocument();
  });

  it("links to the result URL in a new tab", () => {
    render(<ResearchResultCard result={result} rank={1} />);
    const link = screen.getByRole("link", { name: "Example Article" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
