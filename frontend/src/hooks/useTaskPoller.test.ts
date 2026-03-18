import { renderHook, act } from "@testing-library/react";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTaskPoller } from "./useTaskPoller";

vi.mock("@/api/client", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

import { apiClient } from "@/api/client";
const mockGet = vi.mocked(apiClient.get);

describe("useTaskPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval"],
    });
    mockGet.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when taskId is null", () => {
    const { result } = renderHook(() => useTaskPoller(null));
    expect(result.current).toBeNull();
  });

  it("starts polling when taskId is provided", async () => {
    mockGet.mockResolvedValue({
      data: {
        task_id: "abc",
        status: "PENDING",
        result: null,
        traceback: null,
      },
    });

    const { result } = renderHook(() => useTaskPoller("abc", 1000));

    // Let the initial poll fire
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGet).toHaveBeenCalledWith("/api/embeddings/tasks/abc/");
    expect(result.current?.status).toBe("PENDING");
  });

  it("polls again after the interval", async () => {
    mockGet.mockResolvedValue({
      data: {
        task_id: "abc",
        status: "STARTED",
        result: null,
        traceback: null,
      },
    });

    renderHook(() => useTaskPoller("abc", 1000));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGet).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("stops polling on SUCCESS status", async () => {
    mockGet.mockResolvedValue({
      data: {
        task_id: "abc",
        status: "SUCCESS",
        result: { chunk_count: 5 },
        traceback: null,
      },
    });

    const { result } = renderHook(() => useTaskPoller("abc", 1000));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current?.status).toBe("SUCCESS");

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    // Still only 1 call — polling stopped after SUCCESS
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("stops polling on FAILURE status", async () => {
    mockGet.mockResolvedValue({
      data: {
        task_id: "abc",
        status: "FAILURE",
        result: null,
        traceback: "Error",
      },
    });

    renderHook(() => useTaskPoller("abc", 1000));

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("stops polling on REVOKED status", async () => {
    mockGet.mockResolvedValue({
      data: {
        task_id: "abc",
        status: "REVOKED",
        result: null,
        traceback: null,
      },
    });

    renderHook(() => useTaskPoller("abc", 1000));

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("cleans up interval on unmount", async () => {
    mockGet.mockResolvedValue({
      data: {
        task_id: "abc",
        status: "STARTED",
        result: null,
        traceback: null,
      },
    });

    const { unmount } = renderHook(() => useTaskPoller("abc", 1000));

    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    // Only the initial poll fired before unmount
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("does not throw on network errors — continues polling", async () => {
    mockGet
      .mockRejectedValueOnce(new axios.AxiosError("Network error"))
      .mockResolvedValue({
        data: {
          task_id: "abc",
          status: "PENDING",
          result: null,
          traceback: null,
        },
      });

    const { result } = renderHook(() => useTaskPoller("abc", 1000));

    await act(async () => {
      await Promise.resolve();
    });

    // First call failed — result stays null
    expect(result.current).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    // Second call succeeded
    expect(result.current?.status).toBe("PENDING");
  });
});
