import { describe, expect, it } from "vitest";
import { getSimilarityColor, toSimilarityPercent } from "./similarity";

describe("toSimilarityPercent", () => {
  it("converts distance 0 to 100%", () => {
    expect(toSimilarityPercent(0)).toBe(100);
  });

  it("converts distance 1 to 0%", () => {
    expect(toSimilarityPercent(1)).toBe(0);
  });

  it("converts distance 0.12 to 88%", () => {
    expect(toSimilarityPercent(0.12)).toBe(88);
  });

  it("converts distance 0.28 to 72%", () => {
    expect(toSimilarityPercent(0.28)).toBe(72);
  });

  it("clamps negative distances to 100", () => {
    expect(toSimilarityPercent(-0.5)).toBe(100);
  });

  it("clamps distance > 1 to 0", () => {
    expect(toSimilarityPercent(1.5)).toBe(0);
  });
});

describe("getSimilarityColor", () => {
  it("returns green for >= 80%", () => {
    expect(getSimilarityColor(80)).toBe("text-green-600 dark:text-green-400");
    expect(getSimilarityColor(100)).toBe("text-green-600 dark:text-green-400");
  });

  it("returns amber for 50-79%", () => {
    expect(getSimilarityColor(50)).toBe("text-amber-600 dark:text-amber-400");
    expect(getSimilarityColor(79)).toBe("text-amber-600 dark:text-amber-400");
  });

  it("returns red for < 50%", () => {
    expect(getSimilarityColor(49)).toBe("text-red-600 dark:text-red-400");
    expect(getSimilarityColor(0)).toBe("text-red-600 dark:text-red-400");
  });
});
