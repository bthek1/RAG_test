import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";

import { useRunSearch } from "@/hooks/useResearcher";
import * as researcherApi from "@/api/researcher";

vi.mock("@/api/researcher");

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useRunSearch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls runSearch with the correct payload", async () => {
    const mockData = [
      {
        type: "web" as const,
        title: "T",
        url: "https://example.com",
        snippet: "S",
        scraped_text: "X",
      },
    ];
    vi.mocked(researcherApi.runSearch).mockResolvedValue(mockData);

    const { result } = renderHook(() => useRunSearch(), { wrapper });

    act(() => result.current.mutate({ query: "test", max_results: 3 }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(researcherApi.runSearch).toHaveBeenCalled();
  });

  it("exposes error state on failure", async () => {
    vi.mocked(researcherApi.runSearch).mockRejectedValue(
      new Error("Network error"),
    );

    const { result } = renderHook(() => useRunSearch(), { wrapper });

    act(() => result.current.mutate({ query: "fail" }));

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("is in pending state while the request is in-flight", async () => {
    let resolve!: (v: never[]) => void;
    vi.mocked(researcherApi.runSearch).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    const { result } = renderHook(() => useRunSearch(), { wrapper });

    act(() => result.current.mutate({ query: "slow" }));

    await waitFor(() => expect(result.current.isPending).toBe(true));
    resolve([]);
  });
});
