import { ConvexClient } from "convex/browser";
import { expect } from "vitest";

const port = process.env.CONVEX_PORT;
if (!port) {
  throw new Error("CONVEX_PORT is not set");
}

const answerPort = process.env.CONVEX_ANSWER_PORT;
if (!answerPort) {
  throw new Error("CONVEX_ANSWER_PORT is not set");
}

export const client = new ConvexClient(`http://0.0.0.0:${port}`);

const adminKey =
  "0135d8598650f8f5cb0f30c34ec2e2bb62793bc28717c8eb6fb577996d50be5f4281b59181095065c5d0f86a2c31ddbe9b597ec62b47ded69782cd";
export const adminClient = new ConvexClient(`http://0.0.0.0:${port}`);
(adminClient as any).setAdminAuth(adminKey);

const answerAdminClient = new ConvexClient(`http://0.0.0.0:${answerPort}`);
(answerAdminClient as any).setAdminAuth(adminKey);

/**
 * Check that the deployment's schema matches the schema module imported from the answer.
 * ```
 * import schema from "./answer/convex/schema";
 * await checkSchemaExport(schema);
 * ```
 * Pass `null` if we expect there to not be a schema.
 */
export async function checkSchemaExport(schemaModule: any) {
  const schemaJson = schemaModule && JSON.parse(schemaModule.export());
  await checkSchemaJson(schemaJson);
}

/**
 * Check that the deployment's schema matches the schema JSON, passing `null` if
 * we expect there to not be a schema.
 */
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

async function getFunctionSpec(adminClient: any) {
  const result = await adminClient.query(
    "_system/cli/modules:apiSpec" as any,
    {},
  );
  return result;
}

export async function compareFunctionSpec() {
  const generatedFunctionSpec = await getFunctionSpec(adminClient);
  const answerFunctionSpec = await getFunctionSpec(answerAdminClient);
  expect(generatedFunctionSpec).toEqual(answerFunctionSpec);
}
