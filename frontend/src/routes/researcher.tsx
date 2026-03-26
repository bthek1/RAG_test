import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/researcher")({
  component: ResearcherLayout,
});

function ResearcherLayout() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Researcher</h1>
      <Outlet />
    </div>
  );
}
