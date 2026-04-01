import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUIStore } from "@/store/ui";

function wrapper({ children }: { children: ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

// Mock hooks that require router / query context
vi.mock("@/hooks/useAuth", () => ({
  useMe: vi.fn().mockReturnValue({ data: null }),
  useLogout: vi.fn().mockReturnValue(vi.fn()),
}));

vi.mock("@/hooks/useHealth", () => ({
  useHealth: vi.fn().mockReturnValue({ isConnected: true, isPending: false }),
}));

vi.mock("@/hooks/useGpuStatus", () => ({
  useGpuStatus: vi.fn().mockReturnValue({
    gpuStatus: null,
    isAvailable: false,
    isPending: false,
    isError: false,
  }),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useNavigate: vi.fn().mockReturnValue(vi.fn()),
    useRouterState: vi.fn().mockReturnValue("/demo/chart"),
    Link: ({
      children,
      to,
      ...props
    }: {
      children: React.ReactNode;
      to: string;
      [key: string]: unknown;
    }) => (
      <a href={to as string} {...props}>
        {children}
      </a>
    ),
  };
});

vi.mock("@/hooks/useTheme", () => ({
  useTheme: vi.fn().mockReturnValue({ theme: "light", setTheme: vi.fn() }),
}));

vi.mock("@/hooks/useOllamaStatus", () => ({
  useOllamaStatus: vi.fn().mockReturnValue({
    ollamaStatus: null,
    isConnected: false,
    isPending: false,
    isError: false,
  }),
}));

import { Navbar } from "./Navbar";
import * as authHooks from "@/hooks/useAuth";

describe("Navbar", () => {
  beforeEach(() => {
    useUIStore.setState({ sidebarOpen: true });
    vi.clearAllMocks();
    // Reset useMe to unauthenticated
    vi.mocked(authHooks.useMe).mockReturnValue({
      data: null,
    } as unknown as ReturnType<typeof authHooks.useMe>);
  });

  it("renders the app name", () => {
    render(<Navbar />, { wrapper });
    expect(screen.getAllByText("My App").length).toBeGreaterThan(0);
  });

  it("renders the mobile hamburger button", () => {
    render(<Navbar />, { wrapper });
    expect(screen.getByLabelText("Open navigation")).toBeInTheDocument();
  });

  it("renders the desktop sidebar toggle button", () => {
    render(<Navbar />, { wrapper });
    expect(screen.getByLabelText("Toggle sidebar")).toBeInTheDocument();
  });

  it("calls toggleSidebar when desktop hamburger is clicked", async () => {
    const user = userEvent.setup();
    render(<Navbar />, { wrapper });
    const toggle = screen.getByLabelText("Toggle sidebar");
    await user.click(toggle);
    expect(useUIStore.getState().sidebarOpen).toBe(false);
  });

  it("does not show sign-out button when not authenticated", () => {
    render(<Navbar />, { wrapper });
    expect(
      screen.queryByRole("button", { name: /sign out/i }),
    ).not.toBeInTheDocument();
  });

  it("shows sign-out button when authenticated", async () => {
    vi.mocked(authHooks.useMe).mockReturnValue({
      data: {
        id: "1",
        email: "test@example.com",
        first_name: "",
        last_name: "",
        date_joined: "",
      },
    } as ReturnType<typeof authHooks.useMe>);
    const user = userEvent.setup();
    render(<Navbar />, { wrapper });
    // Open the account menu popover to expose the Sign out button
    await user.click(
      screen.getByRole("button", { name: /test@example\.com/i }),
    );
    expect(
      screen.getByRole("button", { name: /sign out/i }),
    ).toBeInTheDocument();
  });
});
