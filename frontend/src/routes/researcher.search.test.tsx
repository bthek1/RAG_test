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

  it("renders the search form with all filters", () => {
    render(<ResearcherSearchPage />, { wrapper });
    expect(screen.getByRole("button", { name: /search/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/search query/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/result type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sort by/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/results/i)).toBeInTheDocument();
  });

  it("has correct default filter values", () => {
    render(<ResearcherSearchPage />, { wrapper });
    expect(screen.getByDisplayValue("All Results")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Relevance")).toBeInTheDocument();
    expect(screen.getByDisplayValue("5 results")).toBeInTheDocument();
  });

  it("submits form with all filter values", async () => {
    const mockRunSearch = vi.mocked(researcherApi.runSearch);
    mockRunSearch.mockResolvedValue([
      {
        type: "web" as const,
        title: "Result",
        url: "https://example.com",
        snippet: "Snippet",
      },
    ]);

    render(<ResearcherSearchPage />, { wrapper });

    await userEvent.type(screen.getByLabelText(/search query/i), "climate");

    // Change filters
    const typeSelect = screen.getByDisplayValue("All Results");
    await userEvent.click(typeSelect);
    await userEvent.click(screen.getByText("News"));

    const sortSelect = screen.getByDisplayValue("Relevance");
    await userEvent.click(sortSelect);
    await userEvent.click(screen.getAllByText("Newest")[0]);

    const resultsSelect = screen.getByDisplayValue("5 results");
    await userEvent.click(resultsSelect);
    await userEvent.click(screen.getByText("10 results"));

    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => {
      expect(mockRunSearch).toHaveBeenCalledWith({
        query: "climate",
        type: "news",
        sort: "date",
        max_results: 10,
      });
    });
  });

  it("submits form and renders result cards", async () => {
    vi.mocked(researcherApi.runSearch).mockResolvedValue([
      {
        type: "web" as const,
        title: "Hit 1",
        url: "https://hit1.com",
        snippet: "Snip",
        scraped_text: "Body",
      },
    ]);

    render(<ResearcherSearchPage />, { wrapper });

    await userEvent.type(screen.getByLabelText(/search query/i), "climate");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => expect(screen.getByText("Hit 1")).toBeInTheDocument());
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
      expect(screen.getByText(/Network error/i)).toBeInTheDocument(),
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

  it("shows initial state before any search", () => {
    render(<ResearcherSearchPage />, { wrapper });
    expect(
      screen.getByText(/enter a search query to begin/i),
    ).toBeInTheDocument();
  });

  it("shows loading state while searching", async () => {
    const mockRunSearch = vi.mocked(researcherApi.runSearch);
    mockRunSearch.mockImplementation(
      () => new Promise(() => {}), // Never resolves
    );

    render(<ResearcherSearchPage />, { wrapper });

    await userEvent.type(screen.getByLabelText(/search query/i), "test");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    expect(screen.getByText(/Searching.../)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Searching/ })).toBeDisabled();
  });

  it("displays result count in heading", async () => {
    const mockResults = [
      {
        type: "web" as const,
        title: "Result 1",
        url: "https://example.com/1",
        snippet: "Snippet 1",
      },
      {
        type: "web" as const,
        title: "Result 2",
        url: "https://example.com/2",
        snippet: "Snippet 2",
      },
    ];

    vi.mocked(researcherApi.runSearch).mockResolvedValue(mockResults);

    render(<ResearcherSearchPage />, { wrapper });

    await userEvent.type(screen.getByLabelText(/search query/i), "test");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() =>
      expect(screen.getByText(/Results \(2\)/)).toBeInTheDocument(),
    );
  });

  it("supports all result type options", async () => {
    render(<ResearcherSearchPage />, { wrapper });

    const typeSelect = screen.getByDisplayValue("All Results");
    await userEvent.click(typeSelect);

    const options = ["All Results", "Web Pages", "News", "Videos", "Images"];
    for (const option of options) {
      expect(screen.getByText(option)).toBeInTheDocument();
    }
  });

  it("supports all sort options", async () => {
    render(<ResearcherSearchPage />, { wrapper });

    const sortSelect = screen.getByDisplayValue("Relevance");
    await userEvent.click(sortSelect);

    const options = ["Relevance", "Newest", "Popularity"];
    for (const option of options) {
      expect(screen.getByText(option)).toBeInTheDocument();
    }
  });

  it("supports result count options 1-20", async () => {
    render(<ResearcherSearchPage />, { wrapper });

    const resultsSelect = screen.getByDisplayValue("5 results");
    await userEvent.click(resultsSelect);

    for (const count of [1, 5, 10, 15, 20]) {
      expect(screen.getByText(`${count} results`)).toBeInTheDocument();
    }
  });
});
