import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";

import * as researcherApi from "@/api/researcher";
import { ResearcherSearchPage } from "@/routes/researcher.search";

vi.mock("@/api/researcher");

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("ResearcherSearchPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the search form", () => {
    render(<ResearcherSearchPage />, { wrapper });
    expect(
      screen.getByRole("button", { name: /search/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/search query/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max results/i)).toBeInTheDocument();
  });

  it("submits form and renders result cards", async () => {
    vi.mocked(researcherApi.runSearch).mockResolvedValue([
      {
        title: "Hit 1",
        url: "https://hit1.com",
        snippet: "Snip",
        scraped_text: "Body",
      },
    ]);

    render(<ResearcherSearchPage />, { wrapper });

    await userEvent.type(screen.getByLabelText(/search query/i), "climate");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() =>
      expect(screen.getByText("Hit 1")).toBeInTheDocument(),
    );
    expect(screen.getByText("https://hit1.com")).toBeInTheDocument();
  });

  it("shows 'no results' message when search returns empty", async () => {
    vi.mocked(researcherApi.runSearch).mockResolvedValue([]);

    render(<ResearcherSearchPage />, { wrapper });

    await userEvent.type(screen.getByLabelText(/search query/i), "nothing");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() =>
      expect(screen.getByText(/no results found/i)).toBeInTheDocument(),
    );
  });

  it("shows error message on failure", async () => {
    vi.mocked(researcherApi.runSearch).mockRejectedValue(
      new Error("Network error"),
    );

    render(<ResearcherSearchPage />, { wrapper });

    await userEvent.type(screen.getByLabelText(/search query/i), "fail");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() =>
      expect(screen.getByText(/search failed/i)).toBeInTheDocument(),
    );
  });

  it("shows validation error for empty query", async () => {
    render(<ResearcherSearchPage />, { wrapper });
    await userEvent.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() =>
      expect(screen.getByText(/query is required/i)).toBeInTheDocument(),
    );
    expect(researcherApi.runSearch).not.toHaveBeenCalled();
  });
});
