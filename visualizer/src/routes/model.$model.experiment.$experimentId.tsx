import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/model/$model/experiment/$experimentId")({
  component: ModelExperimentLayout,
});

function ModelExperimentLayout() {
  return <Outlet />;
}
