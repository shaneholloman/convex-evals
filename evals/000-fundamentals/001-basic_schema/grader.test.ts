import { expect, test } from "vitest";
import {
  checkSchemaJson,
  compareFunctionSpec,
  checkSchemaExport,
} from "../../../grader";
import schema from "./answer/convex/schema";

test("check schema", async () => {
  await checkSchemaExport(schema);
});

test("check function spec", async () => {
  await compareFunctionSpec();
});
