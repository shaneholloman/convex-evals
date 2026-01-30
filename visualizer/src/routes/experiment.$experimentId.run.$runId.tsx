import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/experiment/$experimentId/run/$runId")({
  component: RunLayout,
});

function RunLayout() {
  return <Outlet />;
}
