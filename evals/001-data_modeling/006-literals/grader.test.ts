import { expect, test } from "vitest";
import {
  responseAdminClient,
  responseClient,
  compareSchema,
  compareFunctionSpec,
} from "../../../grader";

test("compare schema", async ({ skip }) => {
  await compareSchema(skip);
});