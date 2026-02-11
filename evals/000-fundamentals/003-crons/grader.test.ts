import { expect, test } from "vitest";
import { responseAdminClient } from "../../../grader";
import { anyApi } from "convex/server";

test("internal emptyAction callable with and without scheduleDescription", async () => {
  const resultNoArg: unknown = await responseAdminClient.action(
    anyApi.crons.emptyAction,
    {},
  );
  expect(resultNoArg).toBe(null);

  const resultWithArg: unknown = await responseAdminClient.action(
    anyApi.crons.emptyAction,
    { scheduleDescription: "run every minute" },
  );
  expect(resultWithArg).toBe(null);
});

test("defines four cron schedules with expected labels and timing", async () => {
  type AdminQuery = {
    query: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  };
  const adminClient = responseAdminClient as unknown as AdminQuery;

  // Try multiple Convex system endpoints that may contain cron metadata.
  // apiSpec doesn't always surface cron labels, so also check cron_jobs.
  let specText = "";

  // Primary: check the scheduled-jobs system table via list endpoint
  try {
    const cronJobs: unknown = await adminClient.query(
      "_system/cli/queryTable",
      { tableName: "_cron_jobs", componentPath: "" },
    );
    specText += JSON.stringify(cronJobs);
  } catch {
    // Endpoint may not exist in all Convex versions
  }

  // Fallback: also include apiSpec output
  try {
    const spec: unknown = await adminClient.query(
      "_system/cli/modules:apiSpec",
      {},
    );
    specText += JSON.stringify(spec);
  } catch {
    // Endpoint may not exist in all Convex versions
  }

  expect(specText.length).toBeGreaterThan(0);
  expect(specText).toContain("run every second");
  expect(specText).toContain("run every minute");
  expect(specText).toContain("run every hour");
  expect(specText).toContain("run every month on the 11th day at 1pm UTC");
  expect(specText).toContain("0 13 11 * *");
});
