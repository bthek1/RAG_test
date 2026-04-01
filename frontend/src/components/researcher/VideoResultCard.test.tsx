import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VideoResultCard } from "@/components/researcher/VideoResultCard";
import type { VideoResult } from "@/types/researcher";

describe("VideoResultCard", () => {
  let mockResult: VideoResult & {
    scraped_text: string;
    thumbnail_url: string;
    duration: string;
    channel: string;
  };

  beforeEach(() => {
    mockResult = {
      type: "video",
      title: "Climate Change Explained",
      url: "https://youtube.com/watch?v=example",
      video_url: "https://youtube.com/embed/example",
      snippet: "A comprehensive video on climate change",
      scraped_text: "Transcript of the video...",
      thumbnail_url: "https://example.com/thumb.jpg",
      duration: "15:42",
      channel: "Educational Channel",
    };
  });

  it("renders video title as link", () => {
    render(<VideoResultCard result={mockResult} rank={1} />);
    const link = screen.getByRole("link", { name: mockResult.title });
    expect(link).toHaveAttribute("href", mockResult.url);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("displays rank badge", () => {
    render(<VideoResultCard result={mockResult} rank={2} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows video duration and channel", () => {
    render(<VideoResultCard result={mockResult} rank={1} />);
    expect(screen.getByText(mockResult.duration)).toBeInTheDocument();
    expect(screen.getByText(mockResult.channel)).toBeInTheDocument();
  });

  it("displays video thumbnail with play button", () => {
    render(<VideoResultCard result={mockResult} rank={1} />);
    const thumbnail = screen.getByAltText(mockResult.title);
    expect(thumbnail).toHaveAttribute("src", mockResult.thumbnail_url);
  });

  it("shows watch video button with proper link", () => {
    render(<VideoResultCard result={mockResult} rank={1} />);
    const watchButton = screen.getByRole("link", { name: /Watch video/ });
    expect(watchButton).toHaveAttribute("href", mockResult.video_url);
    expect(watchButton).toHaveAttribute("target", "_blank");
  });

  it("shows snippet text", () => {
    render(<VideoResultCard result={mockResult} rank={1} />);
    expect(screen.getByText(mockResult.snippet)).toBeInTheDocument();
  });

  it("toggles transcript visibility", async () => {
    const user = userEvent.setup();
    render(<VideoResultCard result={mockResult} rank={1} />);

    // Initially collapsed — button says "Show transcript", content not in DOM
    const showButton = screen.getByRole("button", { name: /Show transcript/ });
    expect(screen.queryByText(mockResult.scraped_text)).not.toBeInTheDocument();

    // Expand
    await user.click(showButton);
    expect(screen.getByText(mockResult.scraped_text)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Hide transcript/ }),
    ).toBeInTheDocument();

    // Collapse again
    await user.click(screen.getByRole("button", { name: /Hide transcript/ }));
    expect(screen.queryByText(mockResult.scraped_text)).not.toBeInTheDocument();
  });

  it("handles missing thumbnail gracefully", () => {
    const resultWithoutThumb: VideoResult = {
      type: "video",
      title: "Video",
      url: "https://example.com",
      snippet: "Snippet",
    };
    const { container } = render(
      <VideoResultCard result={resultWithoutThumb} rank={1} />,
    );

    expect(container.querySelector('img[alt="Video"]')).not.toBeInTheDocument();
  });
});
