import { expect, test } from "vitest";
import { compareFunctionSpec, checkSchemaExport } from "../../../grader";
import { anyApi } from "convex/server";
import schema from "./answer/convex/schema";

test("check schema", async () => {
  await checkSchemaExport(schema);
});

test("check function spec", async () => {
  await compareFunctionSpec();
});
