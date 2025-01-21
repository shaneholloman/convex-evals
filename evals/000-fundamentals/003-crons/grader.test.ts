import { expect, test } from "vitest";
import {
  adminClient,
  client,
  checkSchemaJson,
  compareFunctionSpec,
} from "../../../grader";
import { anyApi } from "convex/server";

test("check schema", async () => {
  await checkSchemaJson(null);
});

test("check function spec", async () => {
  await compareFunctionSpec();
});
