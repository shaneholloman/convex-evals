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
  // TODO: Claude Sonnet 3.5 *really* wants to output the files at `convex/files.ts`.
  await compareFunctionSpec(skip);
});
