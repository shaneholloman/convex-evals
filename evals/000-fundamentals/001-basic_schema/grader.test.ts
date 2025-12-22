import { expect, test } from "vitest";
import {
  responseAdminClient,
  responseClient,
  compareSchema,
  compareFunctionSpec,
} from "../../../grader";
import { api } from "./answer/convex/_generated/api";

test("compare schema", async ({ skip }) => {
  await compareSchema(skip);
});

test("compare function spec", async ({ skip }) => {
  await compareFunctionSpec(skip);
});
