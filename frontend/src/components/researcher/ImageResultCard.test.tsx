import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageResultCard } from "@/components/researcher/ImageResultCard";
import type { ImageResult } from "@/types/researcher";

describe("ImageResultCard", () => {
  let mockResult: ImageResult & {
    scraped_text: string;
    images: string[];
  };

  beforeEach(() => {
    mockResult = {
      type: "image",
      title: "Climate Graphs",
      url: "https://example.com/article",
      original_url: "https://example.com/image/12345",
      snippet: "Important climate trends visualized",
      scraped_text: "Image description and context...",
      images: [
        "https://example.com/img1.jpg",
        "https://example.com/img2.jpg",
        "https://example.com/img3.jpg",
      ],
    };
  });

  it("renders image result title as link", () => {
    render(<ImageResultCard result={mockResult} rank={1} />);
    const link = screen.getByRole("link", { name: mockResult.title });
    expect(link).toHaveAttribute("href", mockResult.url);
  });

  it("displays rank badge", () => {
    render(<ImageResultCard result={mockResult} rank={1} />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows main image by default", () => {
    render(<ImageResultCard result={mockResult} rank={1} />);
    // Component uses alt: `${result.title} - image ${index + 1}`
    const mainImage = screen.getByAltText(
      `${mockResult.title} - image 1`,
    ) as HTMLImageElement;
    expect(mainImage).toHaveAttribute("src", mockResult.images[0]);
  });

  it("displays thumbnail gallery with correct count", () => {
    render(<ImageResultCard result={mockResult} rank={1} />);
    const thumbnails = screen
      .getAllByRole("button")
      .filter((btn) => btn.querySelector("img"));
    expect(thumbnails).toHaveLength(mockResult.images.length);
  });

  it("updates main image when thumbnail is clicked", async () => {
    const user = userEvent.setup();
    render(<ImageResultCard result={mockResult} rank={1} />);

    const thumbnails = screen
      .getAllByRole("button")
      .filter((btn) => btn.querySelector("img"));
    await user.click(thumbnails[1]);

    // Component alt text: `${result.title} - image ${index + 1}`
    const mainImage = screen.getByAltText(
      `${mockResult.title} - image 2`,
    ) as HTMLImageElement;
    expect(mainImage).toHaveAttribute("src", mockResult.images[1]);
  });

  it("shows image count and current position", () => {
    render(<ImageResultCard result={mockResult} rank={1} />);
    expect(screen.getByText("3 images • 1 of 3")).toBeInTheDocument();
  });

  it("shows view source button with correct link", () => {
    render(<ImageResultCard result={mockResult} rank={1} />);
    const viewButton = screen.getByRole("link", { name: /View source/ });
    expect(viewButton).toHaveAttribute("href", mockResult.original_url);
    expect(viewButton).toHaveAttribute("target", "_blank");
  });

  it("toggles description visibility", async () => {
    const user = userEvent.setup();
    render(<ImageResultCard result={mockResult} rank={1} />);

    // Initially collapsed — button says "Show description", content not in DOM
    const showButton = screen.getByRole("button", {
      name: /Show description/,
    });
    expect(screen.queryByText(mockResult.scraped_text)).not.toBeInTheDocument();

    await user.click(showButton);
    expect(screen.getByText(mockResult.scraped_text)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Hide description/ }),
    ).toBeInTheDocument();
  });

  it("displays snippet text", () => {
    render(<ImageResultCard result={mockResult} rank={1} />);
    expect(screen.getByText(mockResult.snippet)).toBeInTheDocument();
  });

  it("handles single image gallery", () => {
    mockResult.images = ["https://example.com/single.jpg"];
    render(<ImageResultCard result={mockResult} rank={1} />);

    expect(screen.getByText("1 image • 1 of 1")).toBeInTheDocument();
    // Thumbnail grid only renders when images.length > 1
    const grid = screen
      .queryAllByRole("button")
      .filter((btn) => btn.querySelector("img"));
    expect(grid).toHaveLength(0);
  });

  it("handles empty images array", () => {
    mockResult.images = [];
    const { container } = render(
      <ImageResultCard result={mockResult} rank={1} />,
    );
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });
});
