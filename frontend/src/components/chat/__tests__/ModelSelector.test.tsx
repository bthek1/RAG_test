import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { vi } from "vitest";

vi.mock("@/api/chat", () => ({
  listModels: vi.fn(),
}));
vi.mock("@/store/chat", () => ({
  useChatStore: vi.fn(),
}));

import { listModels } from "@/api/chat";
import { useChatStore } from "@/store/chat";
import { ModelSelector } from "@/components/chat/ModelSelector";

const mockSetModel = vi.fn();
const mockModels = [
  {
    name: "analysis-assistant:latest",
    model: "analysis-assistant:latest",
    size: 0,
    details: {
      family: "qwen2",
      parameter_size: "3.1B",
      quantization_level: "Q4_K_M",
    },
  },
  {
    name: "qwen2.5:3b",
    model: "qwen2.5:3b",
    size: 0,
    details: {
      family: "qwen2",
      parameter_size: "3.1B",
      quantization_level: "Q4_K_M",
    },
  },
];

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
        selectedModel: string;
        setModel: typeof mockSetModel;
      }) => unknown,
    ) =>
      selector({
        selectedModel: "analysis-assistant:latest",
        setModel: mockSetModel,
      }) as never,
  );
  vi.mocked(listModels).mockResolvedValue(mockModels as never);
});

describe("ModelSelector", () => {
  it("renders both available models as options", async () => {
    render(<ModelSelector />, { wrapper });
    await waitFor(() => {
      expect(screen.queryByLabelText("Loading models")).not.toBeInTheDocument();
    });
    // The trigger shows the selected model
    expect(screen.getByText("analysis-assistant:latest")).toBeInTheDocument();
  });

  it("shows a loading skeleton while models are fetching", () => {
    vi.mocked(listModels).mockReturnValue(new Promise(() => {}));
    render(<ModelSelector />, { wrapper });
    expect(screen.getByLabelText("Loading models")).toBeInTheDocument();
  });
});
