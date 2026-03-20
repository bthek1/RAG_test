import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useGpuStatus } from "./useGpuStatus";
import type { GpuStatus } from "@/types/gpu";

vi.mock("@/api/health", () => ({
  getGpuStatus: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const cpuStatus: GpuStatus = {
  available: false,
  device: "cpu",
  device_name: "cpu",
  vram_total_mb: null,
  vram_used_mb: null,
  vram_free_mb: null,
  embedding_model: "BAAI/bge-large-en-v1.5",
};

const gpuStatusData: GpuStatus = {
  available: true,
  device: "cuda:0",
  device_name: "NVIDIA GeForce RTX 3090",
  vram_total_mb: 24576,
  vram_used_mb: 512,
  vram_free_mb: 24064,
  embedding_model: "BAAI/bge-large-en-v1.5",
};

describe("useGpuStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isAvailable is false when data.available is false", async () => {
    const { getGpuStatus } = await import("@/api/health");
    vi.mocked(getGpuStatus).mockResolvedValue(cpuStatus);

    const { result } = renderHook(() => useGpuStatus(), { wrapper });

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.isAvailable).toBe(false);
    expect(result.current.gpuStatus?.available).toBe(false);
  });

  it("isAvailable is true when data.available is true", async () => {
    const { getGpuStatus } = await import("@/api/health");
    vi.mocked(getGpuStatus).mockResolvedValue(gpuStatusData);

    const { result } = renderHook(() => useGpuStatus(), { wrapper });

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.isAvailable).toBe(true);
    expect(result.current.gpuStatus?.device).toBe("cuda:0");
  });

  it("isAvailable defaults to false while pending", async () => {
    const { getGpuStatus } = await import("@/api/health");
    vi.mocked(getGpuStatus).mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useGpuStatus(), { wrapper });

    expect(result.current.isPending).toBe(true);
    expect(result.current.isAvailable).toBe(false);
  });

  it("isError is true when the query fails", async () => {
    const { getGpuStatus } = await import("@/api/health");
    vi.mocked(getGpuStatus).mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useGpuStatus(), { wrapper });

    // retry: 1 means TanStack Query retries once (after ~1 s) before marking isError
    await waitFor(() => expect(result.current.isError).toBe(true), {
      timeout: 5000,
    });

    expect(result.current.isAvailable).toBe(false);
  });
});
