import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/model/$model")({
  component: ModelLayout,
});

function ModelLayout() {
  return <Outlet />;
}
