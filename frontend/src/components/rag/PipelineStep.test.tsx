import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PipelineStep } from "./PipelineStep";

describe("PipelineStep", () => {
  it("renders icon, label, and description", () => {
    render(
      <PipelineStep
        icon="🧠"
        label="Embedder"
        description="BAAI/bge-large-en-v1.5"
      />,
    );
    expect(screen.getByRole("img", { name: "Embedder" })).toBeInTheDocument();
    expect(screen.getByText("Embedder")).toBeInTheDocument();
    expect(screen.getByText("BAAI/bge-large-en-v1.5")).toBeInTheDocument();
  });

  it("renders without description when omitted", () => {
    render(<PipelineStep icon="📄" label="Document Text" />);
    expect(screen.getByText("Document Text")).toBeInTheDocument();
  });

  it("applies ring class when highlighted", () => {
    const { container } = render(
      <PipelineStep icon="🧠" label="Embedder" highlighted />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/ring-2/);
    expect(root.className).toMatch(/ring-primary/);
  });

  it("does not apply ring class when not highlighted", () => {
    const { container } = render(<PipelineStep icon="📄" label="Doc" />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).not.toMatch(/ring-2/);
  });

  it("applies animate-pulse class in active state", () => {
    const { container } = render(
      <PipelineStep icon="🔍" label="HNSW Search" state="active" />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/animate-pulse/);
  });

  it("applies green border class in done state", () => {
    const { container } = render(
      <PipelineStep icon="✅" label="Done Step" state="done" />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/border-green-500/);
  });

  it("shows checkmark badge in done state", () => {
    render(<PipelineStep icon="✅" label="Done Step" state="done" />);
    expect(screen.getByText("✓")).toBeInTheDocument();
  });

  it("does not show checkmark badge in idle state", () => {
    render(<PipelineStep icon="📄" label="Idle Step" state="idle" />);
    expect(screen.queryByText("✓")).not.toBeInTheDocument();
  });

  it("does not show checkmark badge in active state", () => {
    render(<PipelineStep icon="📄" label="Active Step" state="active" />);
    expect(screen.queryByText("✓")).not.toBeInTheDocument();
  });
});
