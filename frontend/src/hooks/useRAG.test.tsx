import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useRAGQuery, useSearch } from "./useRAG";

vi.mock("@/api/embeddings", () => ({
  searchSimilar: vi.fn(),
  ragQuery: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useSearch", () => {
  it("exposes a mutate function", () => {
    const { result } = renderHook(() => useSearch(), { wrapper });
    expect(typeof result.current.mutate).toBe("function");
  });

  it("starts in idle state", () => {
    const { result } = renderHook(() => useSearch(), { wrapper });
    expect(result.current.isPending).toBe(false);
    expect(result.current.data).toBeUndefined();
  });
});

describe("useRAGQuery", () => {
  it("exposes a mutate function", () => {
    const { result } = renderHook(() => useRAGQuery(), { wrapper });
    expect(typeof result.current.mutate).toBe("function");
  });

  it("starts in idle state", () => {
    const { result } = renderHook(() => useRAGQuery(), { wrapper });
    expect(result.current.isPending).toBe(false);
    expect(result.current.data).toBeUndefined();
  });
});
