import { ConvexClient } from "convex/browser";
import { expect } from "vitest";

const port = process.env.CONVEX_PORT;
if (!port) {
  throw new Error("CONVEX_PORT is not set");
}

export const client = new ConvexClient(`http://0.0.0.0:${port}`);

const adminKey =
  "0135d8598650f8f5cb0f30c34ec2e2bb62793bc28717c8eb6fb577996d50be5f4281b59181095065c5d0f86a2c31ddbe9b597ec62b47ded69782cd";
export const adminClient = new ConvexClient(`http://0.0.0.0:${port}`);
(adminClient as any).setAdminAuth(adminKey);

export async function checkSchemaExport(schemaModule: any) {
  const schemaJson = schemaModule && JSON.parse(schemaModule.export());
  await checkSchemaJson(schemaJson);
}

export async function checkSchemaJson(expected: any) {
  const result = await adminClient.query("_system/frontend/getSchemas" as any, {
    componentId: null,
  });
  if (!result.active) {
    expect(expected).toEqual(null);
    return;
  }
  const schema = JSON.parse(result.active);
  schema.tables.sort((a: any, b: any) =>
    a.tableName.localeCompare(b.tableName),
  );
  if (expected && expected.tables) {
    expected.tables.sort((a: any, b: any) =>
      a.tableName.localeCompare(b.tableName),
    );
  }
  expect(schema).toEqual(expected);
}

export async function checkFunctionSpec(expected: any) {
  const result = await adminClient.query(
    "_system/cli/modules:apiSpec" as any,
    {},
  );
  expected.sort((a: any, b: any) => a.identifier.localeCompare(b.identifier));
  result.sort((a: any, b: any) => a.identifier.localeCompare(b.identifier));
  expect(result).toEqual(expected);
}
