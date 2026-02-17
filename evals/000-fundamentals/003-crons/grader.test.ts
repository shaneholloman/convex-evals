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

type CronSchedule =
  | { type: "interval"; seconds: string | bigint }
  | { type: "cron"; cronExpr: string };

type CronJob = {
  name: string;
  cronSpec: {
    cronSchedule: CronSchedule;
    udfPath: string;
  };
};

async function listCronJobs(): Promise<CronJob[]> {
  type AdminQuery = {
    query: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  };
  const adminClient = responseAdminClient as unknown as AdminQuery;

  // Use the frontend/listCronJobs system endpoint which returns structured
  // cron job documents with name, cronSpec, lastRun, and nextRun fields.
  const result = (await adminClient.query(
    "_system/frontend/listCronJobs",
    {},
  )) as CronJob[];

  return result;
}

function expectInterval(job: CronJob, expectedSeconds: number): void {
  const sched = job.cronSpec.cronSchedule;
  expect(sched.type).toBe("interval");
  if (sched.type === "interval") {
    // The seconds field may be a string or BigInt depending on the backend version
    expect(Number(sched.seconds)).toBe(expectedSeconds);
  }
}

function expectCron(job: CronJob, expectedExpr: string): void {
  const sched = job.cronSpec.cronSchedule;
  expect(sched.type).toBe("cron");
  if (sched.type === "cron") {
    expect(sched.cronExpr).toBe(expectedExpr);
  }
}

test("defines four cron schedules with expected labels and timing", async () => {
  const cronJobs = await listCronJobs();
  const byName = new Map(cronJobs.map((j) => [j.name, j]));

  expect(cronJobs).toHaveLength(4);

  // "run every second" — interval of 1 second
  const everySecond = byName.get("run every second");
  expect(everySecond).toBeDefined();
  expectInterval(everySecond!, 1);

  // "run every minute" — interval of 60 seconds
  const everyMinute = byName.get("run every minute");
  expect(everyMinute).toBeDefined();
  expectInterval(everyMinute!, 60);

  // "run every hour" — interval of 3600 seconds
  const everyHour = byName.get("run every hour");
  expect(everyHour).toBeDefined();
  expectInterval(everyHour!, 3600);

  // "run every month on the 11th day at 1pm UTC" — cron expression
  const everyMonth = byName.get(
    "run every month on the 11th day at 1pm UTC",
  );
  expect(everyMonth).toBeDefined();
  expectCron(everyMonth!, "0 13 11 * *");
});
