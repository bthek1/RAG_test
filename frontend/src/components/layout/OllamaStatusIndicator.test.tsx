import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OllamaStatusIndicator } from "./OllamaStatusIndicator";
import type { OllamaStatus } from "@/types/chat";

function wrapper({ children }: { children: ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

vi.mock("@/hooks/useOllamaStatus");

import * as ollamaHook from "@/hooks/useOllamaStatus";

const connectedStatus: OllamaStatus = {
  connected: true,
  base_url: "http://localhost:11434",
  models: [
    {
      name: "analysis-assistant:latest",
      model: "analysis-assistant:latest",
      size: 4_294_967_296,
      details: {
        family: "llama",
        parameter_size: "7B",
        quantization_level: "Q4_0",
      },
    },
  ],
  running_models: [],
};

const connectedWithGpuModel: OllamaStatus = {
  ...connectedStatus,
  running_models: [
    {
      name: "analysis-assistant:latest",
      model: "analysis-assistant:latest",
      size: 4_294_967_296,
      size_vram: 4_294_967_296,
      details: {
        family: "llama",
        parameter_size: "7B",
        quantization_level: "Q4_0",
      },
      expires_at: "2026-03-25T12:00:00Z",
      processor: "gpu",
    },
  ],
};

const connectedWithCpuModel: OllamaStatus = {
  ...connectedStatus,
  running_models: [
    {
      name: "analysis-assistant:latest",
      model: "analysis-assistant:latest",
      size: 4_294_967_296,
      size_vram: 0,
      details: {
        family: "llama",
        parameter_size: "7B",
        quantization_level: "Q4_0",
      },
      expires_at: "2026-03-25T12:00:00Z",
      processor: "cpu",
    },
  ],
};

const disconnectedStatus: OllamaStatus = {
  connected: false,
  base_url: "http://localhost:11434",
  models: [],
  running_models: [],
};

function mockHook(
  overrides: Partial<ReturnType<typeof ollamaHook.useOllamaStatus>>,
) {
  vi.mocked(ollamaHook.useOllamaStatus).mockReturnValue({
    ollamaStatus: undefined,
    isConnected: false,
    isPending: false,
    isError: false,
    ...overrides,
  });
}

describe("OllamaStatusIndicator", () => {
  it("renders yellow dot and 'Checking…' label when isPending", () => {
    mockHook({ isPending: true });
    render(<OllamaStatusIndicator />, { wrapper });
    expect(screen.getByText("Checking…")).toBeInTheDocument();
    const dot = screen.getByText("Checking…").previousElementSibling;
    expect(dot?.className).toContain("bg-yellow-400");
  });

  it("renders red dot and 'Ollama unknown' label when isError", () => {
    mockHook({ isError: true });
    render(<OllamaStatusIndicator />, { wrapper });
    expect(screen.getByText("Ollama unknown")).toBeInTheDocument();
    const dot = screen.getByText("Ollama unknown").previousElementSibling;
    expect(dot?.className).toContain("bg-red-500");
  });

  it("renders green dot and 'Ollama ready' when connected", () => {
    mockHook({ ollamaStatus: connectedStatus, isConnected: true });
    render(<OllamaStatusIndicator />, { wrapper });
    expect(screen.getByText("Ollama ready")).toBeInTheDocument();
    const dot = screen.getByText("Ollama ready").previousElementSibling;
    expect(dot?.className).toContain("bg-green-500");
  });

  it("renders red dot and 'Ollama offline' when not connected", () => {
    mockHook({ ollamaStatus: disconnectedStatus, isConnected: false });
    render(<OllamaStatusIndicator />, { wrapper });
    expect(screen.getByText("Ollama offline")).toBeInTheDocument();
    const dot = screen.getByText("Ollama offline").previousElementSibling;
    expect(dot?.className).toContain("bg-red-500");
  });

  it("tooltip shows 'Checking Ollama connection…' when pending", async () => {
    mockHook({ isPending: true });
    render(<OllamaStatusIndicator />, { wrapper });
    const trigger = document.querySelector(
      "[data-slot='tooltip-trigger']",
    ) as HTMLElement;
    await userEvent.hover(trigger);
    await waitFor(() =>
      expect(screen.getByRole("tooltip")).toBeInTheDocument(),
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Checking Ollama connection…",
    );
  });

  it("tooltip shows error message when isError", async () => {
    mockHook({ isError: true });
    render(<OllamaStatusIndicator />, { wrapper });
    const trigger = document.querySelector(
      "[data-slot='tooltip-trigger']",
    ) as HTMLElement;
    await userEvent.hover(trigger);
    await waitFor(() =>
      expect(screen.getByRole("tooltip")).toBeInTheDocument(),
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Could not retrieve Ollama status from the backend.",
    );
  });

  it("tooltip shows base_url and model list when connected", async () => {
    mockHook({ ollamaStatus: connectedStatus, isConnected: true });
    render(<OllamaStatusIndicator />, { wrapper });
    const trigger = document.querySelector(
      "[data-slot='tooltip-trigger']",
    ) as HTMLElement;
    await userEvent.hover(trigger);
    await waitFor(() =>
      expect(screen.getByRole("tooltip")).toBeInTheDocument(),
    );
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Ollama Connected");
    expect(tooltip).toHaveTextContent("http://localhost:11434");
    expect(tooltip).toHaveTextContent("analysis-assistant:latest");
    expect(tooltip).toHaveTextContent("4.0 GB");
  });

  it("tooltip shows 'No models installed' when models list is empty", async () => {
    mockHook({
      ollamaStatus: { ...connectedStatus, models: [] },
      isConnected: true,
    });
    render(<OllamaStatusIndicator />, { wrapper });
    const trigger = document.querySelector(
      "[data-slot='tooltip-trigger']",
    ) as HTMLElement;
    await userEvent.hover(trigger);
    await waitFor(() =>
      expect(screen.getByRole("tooltip")).toBeInTheDocument(),
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "No models installed",
    );
  });

  it("tooltip shows GPU tag for a GPU-loaded model", async () => {
    mockHook({ ollamaStatus: connectedWithGpuModel, isConnected: true });
    render(<OllamaStatusIndicator />, { wrapper });
    const trigger = document.querySelector(
      "[data-slot='tooltip-trigger']",
    ) as HTMLElement;
    await userEvent.hover(trigger);
    await waitFor(() =>
      expect(screen.getByRole("tooltip")).toBeInTheDocument(),
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent("GPU");
  });

  it("tooltip shows CPU tag for a CPU-loaded model", async () => {
    mockHook({ ollamaStatus: connectedWithCpuModel, isConnected: true });
    render(<OllamaStatusIndicator />, { wrapper });
    const trigger = document.querySelector(
      "[data-slot='tooltip-trigger']",
    ) as HTMLElement;
    await userEvent.hover(trigger);
    await waitFor(() =>
      expect(screen.getByRole("tooltip")).toBeInTheDocument(),
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent("CPU");
  });

  it("tooltip shows offline message with base_url when disconnected", async () => {
    mockHook({ ollamaStatus: disconnectedStatus, isConnected: false });
    render(<OllamaStatusIndicator />, { wrapper });
    const trigger = document.querySelector(
      "[data-slot='tooltip-trigger']",
    ) as HTMLElement;
    await userEvent.hover(trigger);
    await waitFor(() =>
      expect(screen.getByRole("tooltip")).toBeInTheDocument(),
    );
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Ollama Offline");
    expect(tooltip).toHaveTextContent("http://localhost:11434");
  });
});
