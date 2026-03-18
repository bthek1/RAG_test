import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RAGPipelineVisualizer } from "./RAGPipelineVisualizer";

describe("RAGPipelineVisualizer", () => {
  it("renders without crashing", () => {
    render(<RAGPipelineVisualizer />);
  });

  it("renders ingestion pipeline heading", () => {
    render(<RAGPipelineVisualizer />);
    expect(screen.getByText(/ingestion pipeline/i)).toBeInTheDocument();
  });

  it("renders query pipeline heading", () => {
    render(<RAGPipelineVisualizer />);
    expect(screen.getByText(/query pipeline/i)).toBeInTheDocument();
  });

  it("ingestion pipeline steps are all present in the DOM", () => {
    render(<RAGPipelineVisualizer />);
    expect(screen.getByText("Document Text")).toBeInTheDocument();
    expect(screen.getByText("Chunker")).toBeInTheDocument();
    expect(screen.getByText("pgvector DB")).toBeInTheDocument();
  });

  it("query pipeline steps are all present in the DOM", () => {
    render(<RAGPipelineVisualizer />);
    expect(screen.getByText("User Query")).toBeInTheDocument();
    expect(screen.getByText("HNSW Search")).toBeInTheDocument();
    expect(screen.getByText("Top-k Chunks")).toBeInTheDocument();
    expect(screen.getByText("Claude LLM")).toBeInTheDocument();
    expect(screen.getByText("Answer + Sources")).toBeInTheDocument();
  });

  it("Embedder step appears twice (shared model, one per pipeline)", () => {
    render(<RAGPipelineVisualizer />);
    const embedderLabels = screen.getAllByText("Embedder");
    expect(embedderLabels).toHaveLength(2);
  });

  it("both Embedder steps have the ring-primary highlighted class", () => {
    const { container } = render(<RAGPipelineVisualizer />);
    const highlightedSteps = container.querySelectorAll(".ring-primary");
    expect(highlightedSteps.length).toBeGreaterThanOrEqual(2);
  });

  it("renders the shared embedder callout message", () => {
    render(<RAGPipelineVisualizer />);
    expect(screen.getByText(/same embedding model/i)).toBeInTheDocument();
  });

  it("liveStates embedding=active causes Embedder step to have animate-pulse", () => {
    const { container } = render(
      <RAGPipelineVisualizer
        liveStates={{ embedding: "active", search: "idle", generation: "idle" }}
      />,
    );
    const animatedSteps = container.querySelectorAll(".animate-pulse");
    expect(animatedSteps.length).toBeGreaterThan(0);
  });

  it("liveStates all done causes generation step to show done state", () => {
    const { container } = render(
      <RAGPipelineVisualizer
        liveStates={{ embedding: "done", search: "done", generation: "done" }}
      />,
    );
    const greenBorder = container.querySelectorAll(".border-green-500");
    expect(greenBorder.length).toBeGreaterThan(0);
  });
});
