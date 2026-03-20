import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GpuStatusIndicator } from "./GpuStatusIndicator";
import type { GpuStatus } from "@/types/gpu";

function wrapper({ children }: { children: ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

vi.mock("@/hooks/useGpuStatus");

import * as gpuHook from "@/hooks/useGpuStatus";

const cpuStatus: GpuStatus = {
  available: false,
  device: "cpu",
  device_name: "cpu",
  vram_total_mb: null,
  vram_used_mb: null,
  vram_free_mb: null,
  embedding_model: "BAAI/bge-large-en-v1.5",
};

const gpuStatus: GpuStatus = {
  available: true,
  device: "cuda:0",
  device_name: "NVIDIA GeForce RTX 3090",
  vram_total_mb: 24576,
  vram_used_mb: 512,
  vram_free_mb: 24064,
  embedding_model: "BAAI/bge-large-en-v1.5",
};

function mockHook(overrides: Partial<ReturnType<typeof gpuHook.useGpuStatus>>) {
  vi.mocked(gpuHook.useGpuStatus).mockReturnValue({
    gpuStatus: undefined,
    isAvailable: false,
    isPending: false,
    isError: false,
    ...overrides,
  });
}

describe("GpuStatusIndicator", () => {
  it("renders yellow dot and 'Checking…' label when isPending", () => {
    mockHook({ isPending: true });
    render(<GpuStatusIndicator />, { wrapper });
    expect(screen.getByText("Checking…")).toBeInTheDocument();
    const dot = screen.getByText("Checking…").previousElementSibling;
    expect(dot?.className).toContain("bg-yellow-400");
  });

  it("renders red dot and 'GPU unknown' label when isError", () => {
    mockHook({ isError: true });
    render(<GpuStatusIndicator />, { wrapper });
    expect(screen.getByText("GPU unknown")).toBeInTheDocument();
    const dot = screen.getByText("GPU unknown").previousElementSibling;
    expect(dot?.className).toContain("bg-red-500");
  });

  it("renders green dot and 'GPU active' label when GPU is available", () => {
    mockHook({ gpuStatus: gpuStatus, isAvailable: true });
    render(<GpuStatusIndicator />, { wrapper });
    expect(screen.getByText("GPU active")).toBeInTheDocument();
    const dot = screen.getByText("GPU active").previousElementSibling;
    expect(dot?.className).toContain("bg-green-500");
  });

  it("renders grey dot and 'CPU only' label when no GPU", () => {
    mockHook({ gpuStatus: cpuStatus, isAvailable: false });
    render(<GpuStatusIndicator />, { wrapper });
    expect(screen.getByText("CPU only")).toBeInTheDocument();
    const dot = screen.getByText("CPU only").previousElementSibling;
    expect(dot?.className).toContain("bg-zinc-400");
  });

  it("tooltip shows device, model name, and VRAM stats for GPU", async () => {
    mockHook({ gpuStatus: gpuStatus, isAvailable: true });
    render(<GpuStatusIndicator />, { wrapper });

    const trigger = document.querySelector(
      "[data-slot='tooltip-trigger']",
    ) as HTMLElement;
    await userEvent.hover(trigger);

    await waitFor(() =>
      expect(screen.getByRole("tooltip")).toBeInTheDocument(),
    );

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent(/GPU Available/);
    expect(tooltip).toHaveTextContent(/cuda:0/);
    expect(tooltip).toHaveTextContent(/NVIDIA GeForce RTX 3090/);
    expect(tooltip).toHaveTextContent(/VRAM total/);
    expect(tooltip).toHaveTextContent(/VRAM used/);
    expect(tooltip).toHaveTextContent(/VRAM free/);
  });

  it("tooltip omits VRAM section for CPU case", async () => {
    mockHook({ gpuStatus: cpuStatus, isAvailable: false });
    render(<GpuStatusIndicator />, { wrapper });

    const trigger = document.querySelector(
      "[data-slot='tooltip-trigger']",
    ) as HTMLElement;
    await userEvent.hover(trigger);

    await waitFor(() =>
      expect(screen.getByRole("tooltip")).toBeInTheDocument(),
    );

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent(/No GPU — Running on CPU/);
    expect(tooltip).not.toHaveTextContent(/VRAM total/);
  });

  it("tooltip shows error message when isError", async () => {
    mockHook({ isError: true });
    render(<GpuStatusIndicator />, { wrapper });

    const trigger = document.querySelector(
      "[data-slot='tooltip-trigger']",
    ) as HTMLElement;
    await userEvent.hover(trigger);

    await waitFor(() =>
      expect(screen.getByRole("tooltip")).toBeInTheDocument(),
    );

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent(/Could not retrieve GPU status/);
  });
});
