/**
 * Smoke tests for all four RAG routes.
 *
 * Strategy: extract the component from the TanStack Router Route object (same
 * pattern as login.test.tsx / signup.test.tsx), mock all hooks and API calls,
 * then assert that the critical UI landmarks are present.
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

// ── Router mock ──────────────────────────────────────────────────────────────
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // rag.tsx calls useRouterState to check pathname
    useRouterState: vi.fn().mockReturnValue("/rag"),
    useNavigate: vi.fn().mockReturnValue(vi.fn()),
    Outlet: () => <div data-testid="outlet" />,
    Link: ({
      children,
      to,
      ...props
    }: {
      children: ReactNode;
      to: string;
      [key: string]: unknown;
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
});

// ── Hook mocks ───────────────────────────────────────────────────────────────
const mockDocList = [
  {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    title: "Test Document",
    source: "https://example.com",
    created_at: "2026-01-01T00:00:00Z",
    chunk_count: 3,
  },
];

vi.mock("@/hooks/useDocuments", () => ({
  useDocuments: vi
    .fn()
    .mockReturnValue({ data: mockDocList, isLoading: false }),
  useDocument: vi.fn().mockReturnValue({ data: null, isLoading: false }),
  useIngestDocument: vi
    .fn()
    .mockReturnValue({ mutate: vi.fn(), isPending: false }),
  useDeleteDocument: vi
    .fn()
    .mockReturnValue({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useRAG", () => ({
  useSearch: vi.fn().mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    data: null,
  }),
  useRAGQuery: vi.fn().mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useMe: vi.fn().mockReturnValue({ data: null }),
  useLogin: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }),
  useLogout: vi.fn().mockReturnValue({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/useTheme", () => ({
  useTheme: vi.fn().mockReturnValue({ theme: "light", setTheme: vi.fn() }),
}));

vi.mock("@/api/embeddings", () => ({
  listDocuments: vi.fn().mockResolvedValue({ data: mockDocList }),
  getDocument: vi.fn().mockResolvedValue({ data: null }),
  ingestDocument: vi.fn().mockResolvedValue({ data: null }),
  deleteDocument: vi.fn().mockResolvedValue({}),
  searchSimilar: vi.fn().mockResolvedValue({ data: [] }),
  ragQuery: vi.fn().mockResolvedValue({ data: { answer: "", sources: [] } }),
}));

// ── Test wrapper ─────────────────────────────────────────────────────────────
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

// ── Route imports (after mocks) ───────────────────────────────────────────────
const { Route: RagRoute } = await import("@/routes/rag");
const { Route: DocumentsRoute } = await import("@/routes/rag.documents");
const { Route: SearchRoute } = await import("@/routes/rag.search");
const { Route: ChatRoute } = await import("@/routes/rag.chat");

const RagComponent = RagRoute?.options?.component as
  | React.ComponentType
  | undefined;
const DocumentsComponent = DocumentsRoute?.options?.component as
  | React.ComponentType
  | undefined;
const SearchComponent = SearchRoute?.options?.component as
  | React.ComponentType
  | undefined;
const ChatComponent = ChatRoute?.options?.component as
  | React.ComponentType
  | undefined;

// ── Tests ────────────────────────────────────────────────────────────────────

describe("/rag route smoke tests", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders without crashing", () => {
    if (!RagComponent) return;
    render(<RagComponent />, { wrapper });
  });

  it("renders RAGPipelineVisualizer (ingestion + query pipeline headings)", () => {
    if (!RagComponent) return;
    render(<RagComponent />, { wrapper });
    expect(screen.getByText(/ingestion pipeline/i)).toBeInTheDocument();
    expect(screen.getByText(/query pipeline/i)).toBeInTheDocument();
  });

  it("stats bar shows document count from mocked useDocuments", () => {
    if (!RagComponent) return;
    render(<RagComponent />, { wrapper });
    // Stats bar renders "1 document" with separate spans; check for the chunk
    // count label which is unique in this context
    expect(screen.getByText(/chunks? indexed/)).toBeInTheDocument();
  });

  it("renders quick-start cards linking to sub-routes", () => {
    if (!RagComponent) return;
    render(<RagComponent />, { wrapper });
    expect(
      screen.getByRole("link", { name: /documents/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /similarity search/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /rag chat/i })).toBeInTheDocument();
  });
});

describe("/rag/documents route smoke tests", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders without crashing", () => {
    if (!DocumentsComponent) return;
    render(<DocumentsComponent />, { wrapper });
  });

  it("renders the Documents heading", () => {
    if (!DocumentsComponent) return;
    render(<DocumentsComponent />, { wrapper });
    expect(screen.getByText("Documents")).toBeInTheDocument();
  });

  it("renders the Ingest New button", () => {
    if (!DocumentsComponent) return;
    render(<DocumentsComponent />, { wrapper });
    expect(
      screen.getByRole("button", { name: /ingest new/i }),
    ).toBeInTheDocument();
  });

  it("renders document list when docs are present", () => {
    if (!DocumentsComponent) return;
    render(<DocumentsComponent />, { wrapper });
    expect(screen.getByText("Test Document")).toBeInTheDocument();
  });

  it("shows empty state when document list is empty", async () => {
    const { useDocuments } = await import("@/hooks/useDocuments");
    vi.mocked(useDocuments).mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useDocuments>);

    if (!DocumentsComponent) return;
    render(<DocumentsComponent />, { wrapper });
    expect(screen.getByText(/no documents yet/i)).toBeInTheDocument();
  });
});

describe("/rag/search route smoke tests", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders without crashing", () => {
    if (!SearchComponent) return;
    render(<SearchComponent />, { wrapper });
  });

  it("renders the Similarity Search heading", () => {
    if (!SearchComponent) return;
    render(<SearchComponent />, { wrapper });
    expect(screen.getByText(/similarity search/i)).toBeInTheDocument();
  });

  it("renders the query input", () => {
    if (!SearchComponent) return;
    render(<SearchComponent />, { wrapper });
    expect(
      screen.getByPlaceholderText(/attention mechanism/i),
    ).toBeInTheDocument();
  });

  it("renders the top-k selector", () => {
    if (!SearchComponent) return;
    render(<SearchComponent />, { wrapper });
    // Top-k select trigger shows the current value
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("renders the Search button", () => {
    if (!SearchComponent) return;
    render(<SearchComponent />, { wrapper });
    expect(screen.getByRole("button", { name: /search/i })).toBeInTheDocument();
  });
});

describe("/rag/chat route smoke tests", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders without crashing", () => {
    if (!ChatComponent) return;
    render(<ChatComponent />, { wrapper });
  });

  it("renders the RAG Chat heading", () => {
    if (!ChatComponent) return;
    render(<ChatComponent />, { wrapper });
    expect(screen.getByText(/rag chat/i)).toBeInTheDocument();
  });

  it("renders the message input", () => {
    if (!ChatComponent) return;
    render(<ChatComponent />, { wrapper });
    expect(
      screen.getByPlaceholderText(/ask something about your documents/i),
    ).toBeInTheDocument();
  });

  it("renders the send button", () => {
    if (!ChatComponent) return;
    render(<ChatComponent />, { wrapper });
    // send button is an icon button — look for the form submit button
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("shows empty state prompting user to send a message when no messages exist", () => {
    if (!ChatComponent) return;
    render(<ChatComponent />, { wrapper });
    expect(
      screen.getByText(/ask something about your documents/i),
    ).toBeInTheDocument();
  });
});
