import {
  createRootRoute,
  Outlet,
  useRouterState,
  redirect,
} from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { queryClient } from "@/api/queryClient";
import { queryKeys } from "@/api/queryKeys";
import { getMe } from "@/api/auth";

// These paths render without the app shell (no navbar/sidebar)
const PUBLIC_PATHS = ["/", "/login", "/signup"];

export const Route = createRootRoute({
  loader: async ({ location }) => {
    // Don't check auth for public paths
    if (PUBLIC_PATHS.includes(location.pathname)) {
      return null;
    }

    // For protected paths, verify authentication
    const hasToken = !!localStorage.getItem("access_token");
    if (!hasToken) {
      throw redirect({ to: "/login" });
    }

    // Verify token is still valid by fetching /me
    try {
      await queryClient.ensureQueryData({
        queryKey: queryKeys.auth.me,
        queryFn: getMe,
      });
    } catch {
      // Token is invalid or expired
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      throw redirect({ to: "/login" });
    }
  },
  component: RootComponent,
});

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (isPublic) return <Outlet />;
  return <AppLayout />;
}
