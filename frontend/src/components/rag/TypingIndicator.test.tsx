import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TypingIndicator } from "./TypingIndicator";

describe("TypingIndicator", () => {
  it("renders three animated dot elements", () => {
    const { container } = render(<TypingIndicator />);
    const dots = container.querySelectorAll(".animate-bounce");
    expect(dots).toHaveLength(3);
  });

  it("has accessible aria-label describing the loading state", () => {
    render(<TypingIndicator />);
    expect(screen.getByLabelText(/claude is thinking/i)).toBeInTheDocument();
  });

  it("each dot has a staggered animation-delay style", () => {
    const { container } = render(<TypingIndicator />);
    const dots = Array.from(
      container.querySelectorAll(".animate-bounce"),
    ) as HTMLElement[];
    const delays = dots.map((d) => d.style.animationDelay);
    // delays should be distinct
    const unique = new Set(delays);
    expect(unique.size).toBe(3);
  });
});
