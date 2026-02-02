import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/model/$model/experiment/$experimentId/run/$runId/$category"
)({
  component: ModelCategoryLayout,
});

function ModelCategoryLayout() {
  return <Outlet />;
}
