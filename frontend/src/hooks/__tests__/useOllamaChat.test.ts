import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { vi } from "vitest";

vi.mock("@/store/chat", () => ({
  useChatStore: vi.fn(),
}));

import { useChatStore } from "@/store/chat";
import { useStreamingChat } from "@/hooks/useOllamaChat";

const mockAppendToken = vi.fn();
const mockAddMessage = vi.fn();

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(
    QueryClientProvider,
    { client: queryClient },
    children,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useChatStore).mockImplementation(
    (
      selector: (s: {
        addMessage: typeof mockAddMessage;
        appendToken: typeof mockAppendToken;
      }) => unknown,
    ) =>
      selector({
        addMessage: mockAddMessage,
        appendToken: mockAppendToken,
      }) as never,
  );
});

describe("useStreamingChat", () => {
  it("calls appendToken for each SSE token line", async () => {
    const sseLines = [
      `data: ${JSON.stringify({ token: "He" })}\n\n`,
      `data: ${JSON.stringify({ token: "llo" })}\n\n`,
      "data: [DONE]\n\n",
    ];
    const encoder = new TextEncoder();

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: encoder.encode(sseLines.join("")),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    } as unknown as Response);

    const { result } = renderHook(() => useStreamingChat(), { wrapper });
    await act(async () => {
      await result.current.send(
        "conv-1",
        [{ role: "user", content: "Hello" }],
        "analysis-assistant",
      );
    });

    expect(mockAddMessage).toHaveBeenCalledTimes(2); // user + empty assistant seed
    expect(mockAppendToken).toHaveBeenCalledWith("conv-1", "He");
    expect(mockAppendToken).toHaveBeenCalledWith("conv-1", "llo");
  });
});
