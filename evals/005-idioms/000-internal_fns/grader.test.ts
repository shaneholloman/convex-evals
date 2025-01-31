import { expect, test } from "vitest";
import {
  responseClient,
  responseAdminClient,
  compareFunctionSpec,
} from "../../../grader";
import { api, internal } from "./answer/convex/_generated/api";

test("compare function spec", async ({ skip }) => {
  await compareFunctionSpec(skip);
});

test("getPublicStats returns correct static data", async () => {
  const stats = await responseClient.query(api.index.getPublicStats, {});

  expect(stats).toEqual({
    totalUsers: 100,
    version: "1.0.0",
  });
});

test("getPublicStats is accessible to clients", async () => {
  // Should not throw
  await expect(
    responseClient.query(api.index.getPublicStats, {})
  ).resolves.toBeDefined();
});

test("logClientEvent returns timestamp and is accessible to clients", async () => {
  const now = Date.now();
  const timestamp = await responseClient.mutation(api.index.logClientEvent, {
    eventName: "test_event",
    data: { test: true },
  });

  expect(typeof timestamp).toBe("number");
  expect(timestamp).toBeGreaterThanOrEqual(now);
});

test("logClientEvent handles different data types", async () => {
  const testCases = [
    { eventName: "string_test", data: "test string" },
    { eventName: "number_test", data: 123 },
    { eventName: "boolean_test", data: true },
    { eventName: "object_test", data: { key: "value" } },
    { eventName: "array_test", data: [1, 2, 3] },
    { eventName: "null_test", data: null },
  ];

  for (const testCase of testCases) {
    const timestamp = await responseClient.mutation(api.index.logClientEvent, testCase);
    expect(typeof timestamp).toBe("number");
  }
});

test("dailyCleanup is not accessible to regular clients", async () => {
  // @ts-expect-error - Testing that this function is not accessible
  await expect(responseClient.action(api.index.dailyCleanup)).rejects.toThrow();
});

test("dailyCleanup is accessible to admin clients", async () => {
  // Should not throw
  await expect(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    responseAdminClient.action((internal.index.dailyCleanup as any), {})
  ).resolves.toBeNull();
});

test("resetCounter is not accessible to regular clients", async () => {
  // @ts-expect-error - Testing that this function is not accessible
  await expect(responseClient.mutation(api.index.resetCounter)).rejects.toThrow();
});

test("resetCounter is accessible to admin clients", async () => {
  // Should not throw
  await expect(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    responseAdminClient.mutation((internal.index.resetCounter as any), {})
  ).resolves.toBeNull();
});

test("function visibility is correctly set", async () => {
  // Public functions should be accessible
  await expect(responseClient.query(api.index.getPublicStats, {})).resolves.toBeDefined();
  await expect(
    responseClient.mutation(api.index.logClientEvent, {
      eventName: "test",
      data: null,
    })
  ).resolves.toBeDefined();

  // Internal functions should not be accessible to regular clients
  // @ts-expect-error - Testing that these functions are not accessible
  await expect(responseClient.action(api.index.dailyCleanup)).rejects.toThrow();
  // @ts-expect-error - Testing that these functions are not accessible
  await expect(responseClient.mutation(api.index.resetCounter)).rejects.toThrow();

  // But should be accessible to admin clients
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await expect(responseAdminClient.action((internal.index.dailyCleanup as any), {})).resolves.toBeNull();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await expect(responseAdminClient.mutation((internal.index.resetCounter as any), {})).resolves.toBeNull();
});

test("getPublicStats returns consistent data", async () => {
  const results = await Promise.all([
    responseClient.query(api.index.getPublicStats, {}),
    responseClient.query(api.index.getPublicStats, {}),
    responseClient.query(api.index.getPublicStats, {}),
  ]);

  const [first, ...rest] = results;
  for (const result of rest) {
    expect(result).toEqual(first);
  }
});