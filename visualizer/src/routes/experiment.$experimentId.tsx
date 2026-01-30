import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/experiment/$experimentId")({
  component: ExperimentLayout,
});

function ExperimentLayout() {
  return <Outlet />;
}
