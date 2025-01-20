import { ConvexClient } from "convex/browser";

const port = process.env.CONVEX_PORT;
if (!port) {
  throw new Error("CONVEX_PORT is not set");
}

export const client = new ConvexClient(`http://0.0.0.0:${port}`);

const adminKey =
  "0135d8598650f8f5cb0f30c34ec2e2bb62793bc28717c8eb6fb577996d50be5f4281b59181095065c5d0f86a2c31ddbe9b597ec62b47ded69782cd";
export const adminClient = new ConvexClient(`http://0.0.0.0:${port}`);
(adminClient as any).setAdminAuth(adminKey);

export async function getActiveSchema() {
  const result = await adminClient.query("_system/frontend/getSchemas" as any, {
    componentId: null,
  });
  if (!result.active) {
    return null;
  }
  return JSON.parse(result.active);
}
