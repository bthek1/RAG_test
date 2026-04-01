import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewsResultCard } from "@/components/researcher/NewsResultCard";
import type { NewsResult } from "@/types/researcher";

describe("NewsResultCard", () => {
  let mockResult: NewsResult & { scraped_text: string };

  beforeEach(() => {
    mockResult = {
      type: "news",
      title: "Climate Policy Update 2024",
      url: "https://example.com/news",
      snippet: "Latest climate policy changes announced",
      scraped_text: "Full article text here...",
      source: "Reuters",
      published_at: new Date(Date.now() - 86400000).toISOString(),
      author: "Jane Doe",
    };
  });

  it("renders news article title as link", () => {
    render(<NewsResultCard result={mockResult} rank={1} />);
    const link = screen.getByRole("link", { name: mockResult.title });
    expect(link).toHaveAttribute("href", mockResult.url);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("displays rank badge", () => {
    render(<NewsResultCard result={mockResult} rank={3} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows source and publication date", () => {
    render(<NewsResultCard result={mockResult} rank={1} />);
    expect(screen.getByText(mockResult.source!)).toBeInTheDocument();
    expect(screen.getByText(/ago/)).toBeInTheDocument();
  });

  it("displays author information", () => {
    render(<NewsResultCard result={mockResult} rank={1} />);
    expect(screen.getByText(`By ${mockResult.author}`)).toBeInTheDocument();
  });

  it("shows snippet text", () => {
    render(<NewsResultCard result={mockResult} rank={1} />);
    expect(screen.getByText(mockResult.snippet)).toBeInTheDocument();
  });

  it("toggles full article visibility", async () => {
    const user = userEvent.setup();
    render(<NewsResultCard result={mockResult} rank={1} />);

    // Initially collapsed — button says "Show full article", content not in DOM
    const showButton = screen.getByRole("button", {
      name: /Show full article/,
    });
    expect(showButton).toBeInTheDocument();
    expect(screen.queryByText(mockResult.scraped_text)).not.toBeInTheDocument();

    // Expand
    await user.click(showButton);
    expect(screen.getByText(mockResult.scraped_text)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Hide full article/ }),
    ).toBeInTheDocument();

    // Collapse again
    await user.click(screen.getByRole("button", { name: /Hide full article/ }));
    expect(screen.queryByText(mockResult.scraped_text)).not.toBeInTheDocument();
  });

  it("marks scraped_text error state visually", async () => {
    const user = userEvent.setup();
    mockResult.scraped_text = "[scrape failed: timeout]";
    const { container } = render(
      <NewsResultCard result={mockResult} rank={1} />,
    );

    const toggleButton = screen.getByRole("button");
    await user.click(toggleButton);

    const preElement = container.querySelector("pre");
    expect(preElement).toHaveClass("text-destructive");
  });
});
