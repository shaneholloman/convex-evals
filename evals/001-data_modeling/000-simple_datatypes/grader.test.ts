import { expect, test } from "vitest";
import { compareFunctionSpec, compareSchema } from "../../../grader";

test("compare schema", async () => {
  await compareSchema();
});

test("compare function spec", async () => {
  await compareFunctionSpec();
});
