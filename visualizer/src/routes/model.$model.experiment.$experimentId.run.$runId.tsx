import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/model/$model/experiment/$experimentId/run/$runId"
)({
  component: ModelRunLayout,
});

function ModelRunLayout() {
  return <Outlet />;
}
