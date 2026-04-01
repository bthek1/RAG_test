import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResearchResultCard } from "@/components/researcher/ResearchResultCard";
import type { SearchResult, WebResult, NewsResult } from "@/types/researcher";

// Mock the type-specific components to simplify testing
vi.mock("@/components/researcher/NewsResultCard", () => ({
  NewsResultCard: ({ result, rank }: any) => (
    <div data-testid="news-card">
      News Card - {result.title} - Rank {rank}
    </div>
  ),
}));

vi.mock("@/components/researcher/VideoResultCard", () => ({
  VideoResultCard: ({ result, rank }: any) => (
    <div data-testid="video-card">
      Video Card - {result.title} - Rank {rank}
    </div>
  ),
}));

vi.mock("@/components/researcher/ImageResultCard", () => ({
  ImageResultCard: ({ result, rank }: any) => (
    <div data-testid="image-card">
      Image Card - {result.title} - Rank {rank}
    </div>
  ),
}));

describe("ResearchResultCard - Dispatcher", () => {
  it("renders NewsResultCard for news type", () => {
    const result: NewsResult = {
      type: "news",
      title: "News Article",
      url: "https://example.com",
      snippet: "News snippet",
      source: "Reuters",
    };

    render(<ResearchResultCard result={result} rank={1} />);
    expect(screen.getByTestId("news-card")).toBeInTheDocument();
    expect(screen.getByText(/News Article.*Rank 1/)).toBeInTheDocument();
  });

  it("renders VideoResultCard for video type", () => {
    const result: SearchResult = {
      type: "video",
      title: "Video Title",
      url: "https://youtube.com/watch?v=abc",
      snippet: "Video snippet",
      video_url: "https://youtube.com/embed/abc",
    };

    render(<ResearchResultCard result={result} rank={2} />);
    expect(screen.getByTestId("video-card")).toBeInTheDocument();
    expect(screen.getByText(/Video Title.*Rank 2/)).toBeInTheDocument();
  });

  it("renders ImageResultCard for image type", () => {
    const result: SearchResult = {
      type: "image",
      title: "Image Gallery",
      url: "https://example.com/article",
      snippet: "Image snippet",
      images: ["https://example.com/img1.jpg"],
    };

    render(<ResearchResultCard result={result} rank={3} />);
    expect(screen.getByTestId("image-card")).toBeInTheDocument();
    expect(screen.getByText(/Image Gallery.*Rank 3/)).toBeInTheDocument();
  });

  it("renders WebResultCard for web type", () => {
    const result: WebResult = {
      type: "web",
      title: "Web Page",
      url: "https://example.com",
      snippet: "Page snippet",
      scraped_text: "Page content",
    };

    render(<ResearchResultCard result={result} rank={1} />);
    // Web result should render a card (not mocked, so we check for elements)
    const link = screen.getByRole("link", { name: /Web Page/ });
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("defaults to WebResultCard when type is not provided", () => {
    const result = {
      title: "Default Result",
      url: "https://example.com",
      snippet: "Default snippet",
    } as any;

    render(<ResearchResultCard result={result} rank={1} />);
    const link = screen.getByRole("link", { name: /Default Result/ });
    expect(link).toBeInTheDocument();
  });
});

describe("WebResultCard (within ResearchResultCard)", () => {
  it("renders web result with rank badge", () => {
    const result: WebResult = {
      type: "web",
      title: "Example Page",
      url: "https://example.com",
      snippet: "This is an example",
      scraped_text: "Full page content",
    };

    render(<ResearchResultCard result={result} rank={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders title as external link", () => {
    const result: WebResult = {
      type: "web",
      title: "External Link",
      url: "https://external.com/article",
      snippet: "Article snippet",
    };

    render(<ResearchResultCard result={result} rank={1} />);
    const link = screen.getByRole("link", { name: /External Link/ });
    expect(link).toHaveAttribute("href", "https://external.com/article");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("displays URL and snippet", () => {
    const result: WebResult = {
      type: "web",
      title: "Test Page",
      url: "https://test.example.com/page",
      snippet: "This is the snippet text",
    };

    render(<ResearchResultCard result={result} rank={1} />);
    expect(
      screen.getByText("https://test.example.com/page"),
    ).toBeInTheDocument();
    expect(screen.getByText("This is the snippet text")).toBeInTheDocument();
  });

  it("toggles scraped content visibility", async () => {
    const user = userEvent.setup();
    const result: WebResult = {
      type: "web",
      title: "Test Page",
      url: "https://test.com",
      snippet: "Snippet",
      scraped_text: "The full scraped content goes here",
    };

    render(<ResearchResultCard result={result} rank={1} />);

    const toggleButton = screen.getByRole("button", {
      name: /Hide scraped content/,
    });
    expect(
      screen.queryByText("The full scraped content goes here"),
    ).not.toBeVisible();

    await user.click(toggleButton);
    expect(
      screen.getByText("The full scraped content goes here"),
    ).toBeVisible();
  });

  it("marks scrape failure in red", async () => {
    const user = userEvent.setup();
    const result: WebResult = {
      type: "web",
      title: "Failed Scrape",
      url: "https://test.com",
      snippet: "Snippet",
      scraped_text: "[scrape failed: timeout]",
    };

    const { container } = render(
      <ResearchResultCard result={result} rank={1} />,
    );

    const toggleButton = screen.getByRole("button");
    await user.click(toggleButton);

    const preElement = container.querySelector("pre");
    expect(preElement).toHaveClass("text-destructive");
  });
});
