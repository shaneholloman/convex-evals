import { expect, test } from "vitest";
import { adminClient, client, getActiveSchema } from "../../../grader";
import { anyApi } from "convex/server";

test("get schema", async () => {
  const schema = await getActiveSchema();
  expect(schema).toBeNull();
});
