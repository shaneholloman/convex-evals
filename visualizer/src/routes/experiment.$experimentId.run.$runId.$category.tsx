import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/experiment/$experimentId/run/$runId/$category")({
  component: CategoryLayout,
});

function CategoryLayout() {
  return <Outlet />;
}
