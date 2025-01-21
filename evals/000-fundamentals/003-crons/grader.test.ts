import { expect, test } from "vitest";
import {
  adminClient,
  client,
  checkSchemaJson,
  checkFunctionSpec,
} from "../../../grader";
import { anyApi } from "convex/server";

test("check schema", async () => {
  await checkSchemaJson(null);
});

test("check function spec", async () => {
  await checkFunctionSpec([]);
});
