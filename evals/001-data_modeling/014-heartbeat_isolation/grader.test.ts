import { beforeEach, expect, test } from "vitest";
import {
  addDocuments,
  deleteAllDocuments,
  findTable,
  getSchema,
  listTable,
  readOutputFile,
  responseAdminClient,
  responseClient,
} from "../../../grader";
import { anyApi } from "convex/server";

beforeEach(async () => {
  const schema = await getSchema(responseAdminClient);
  if (schema && Array.isArray(schema.tables)) {
    const tableNames = schema.tables.map((t: any) => t.tableName);
    await deleteAllDocuments(responseAdminClient, tableNames);
  }
});

test("listOnlineUsers returns empty when no users are online", async () => {
  const result = await responseClient.query(anyApi.index.listOnlineUsers, {
    activeWithinMs: 60_000,
    nowMs: 1_000_000,
  });

  expect(result).toEqual([]);
});

test("recordHeartbeat creates then updates a single record per user", async () => {
  await addDocuments(responseAdminClient, "users", [
    { name: "Alice", email: "alice@example.com" },
  ]);
  const [alice] = await listTable(responseAdminClient, "users", 10);

  await responseClient.mutation(anyApi.index.recordHeartbeat, {
    userId: alice._id,
    nowMs: 1_000,
  });
  await responseClient.mutation(anyApi.index.recordHeartbeat, {
    userId: alice._id,
    nowMs: 2_000,
  });

  const schema = await getSchema(responseAdminClient);
  const tables = (schema?.tables ?? []) as { tableName: string }[];
  const presenceTable = tables.find(
    (t) => !t.tableName.startsWith("_") && t.tableName !== "users",
  );
  expect(
    presenceTable,
    "Expected a separate presence table besides users",
  ).toBeTruthy();

  const presenceRows = await listTable(
    responseAdminClient,
    presenceTable!.tableName,
    100,
  );
  const aliceRows = presenceRows.filter((r) => r.userId === alice._id);
  expect(aliceRows).toHaveLength(1);
});

test("listOnlineUsers filters by heartbeat threshold", async () => {
  await addDocuments(responseAdminClient, "users", [
    { name: "Alice", email: "alice@example.com" },
    { name: "Bob", email: "bob@example.com" },
    { name: "Cara", email: "cara@example.com" },
  ]);
  const users = await listTable(responseAdminClient, "users", 10);
  const alice = users.find((u) => u.email === "alice@example.com");
  const bob = users.find((u) => u.email === "bob@example.com");
  const cara = users.find((u) => u.email === "cara@example.com");

  await responseClient.mutation(anyApi.index.recordHeartbeat, {
    userId: alice!._id,
    nowMs: 9_950,
  });
  await responseClient.mutation(anyApi.index.recordHeartbeat, {
    userId: bob!._id,
    nowMs: 8_000,
  });
  await responseClient.mutation(anyApi.index.recordHeartbeat, {
    userId: cara!._id,
    nowMs: 9_990,
  });

  const result = (await responseClient.query(anyApi.index.listOnlineUsers, {
    activeWithinMs: 200,
    nowMs: 10_000,
  })) as any[];

  expect(result).toHaveLength(2);
  const names = result.map((r: any) => r.name).sort();
  expect(names).toEqual(["Alice", "Cara"]);
});

test("schema uses a separate table for presence instead of adding fields to users", async () => {
  const schema = await getSchema(responseAdminClient);
  const tables = (schema?.tables ?? []) as { tableName: string }[];
  const userTables = tables.filter((t) => !t.tableName.startsWith("_"));

  expect(
    userTables.length,
    "Expected at least 2 tables (users + presence). " +
      "Storing heartbeat fields directly on the users table causes unnecessary " +
      "write contention on profile data from high-churn heartbeat updates.",
  ).toBeGreaterThanOrEqual(2);

  const usersTable = findTable(schema, "users");
  expect(usersTable).toBeTruthy();
});

test("generated schema does not put heartbeat fields on users table", () => {
  const sourceText = readOutputFile(
    "001-data_modeling",
    "014-heartbeat_isolation",
    "convex/schema.ts",
  );

  const usersMatch = sourceText.match(
    /users:\s*defineTable\(\{[\s\S]*?\}\)\s*(?:\.index\([^)]*\))*/,
  );
  const usersSection = usersMatch ? usersMatch[0] : "";
  expect(usersSection.length).toBeGreaterThan(0);

  const forbiddenFields = [
    "lastHeartbeat",
    "lastHeartbeatMs",
    "isOnline",
    "lastSeen",
    "lastSeenAt",
    "heartbeat",
    "lastActive",
    "lastActiveMs",
  ];

  for (const fieldName of forbiddenFields) {
    expect(
      new RegExp(`\\b${fieldName}\\b\\s*:`).test(usersSection),
      `users table should not contain heartbeat field "${fieldName}"`,
    ).toBe(false);
  }
});
