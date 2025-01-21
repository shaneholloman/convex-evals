import { expect, test } from "vitest";
import {
  adminClient,
  client,
  compareSchema,
  compareFunctionSpec,
} from "../../../grader";
import { anyApi } from "convex/server";

test("compare schema", async () => {
  await compareSchema();
});

test("compare function spec", async () => {
  // TODO: Claude Sonnet 3.5 *really* wants to output the files at `convex/files.ts`.
  // await compareFunctionSpec();
});
