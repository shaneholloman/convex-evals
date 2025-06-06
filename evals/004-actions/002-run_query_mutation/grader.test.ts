import { expect, test } from "vitest";
import {
  responseAdminClient,
  responseClient,
  compareSchema,
  compareFunctionSpec,
  deleteAllDocuments,
  listTable,
} from "../../../grader";
import { api } from "./answer/convex/_generated/api";
import { beforeEach } from "vitest";
import { Doc } from "./answer/convex/_generated/dataModel";

beforeEach(async () => {
  await deleteAllDocuments(responseAdminClient, ["fetchRequests"]);
});

test("compare schema", async ({ skip }) => {
  await compareSchema(skip);
});

test("compare function spec", async ({ skip }) => {
  await compareFunctionSpec(skip);
});

test("fetchIfNeeded caches new requests", async () => {
  const testUrl = "https://httpbin.org/json";

  // First request should fetch and cache
  const id1 = await responseClient.action(api.index.fetchIfNeeded, {
    url: testUrl,
  });
  expect(id1).toBeDefined();

  // Check the cached data
  const results = (await listTable(responseAdminClient, "fetchRequests")) as Doc<"fetchRequests">[];
  expect(results).toHaveLength(1);
  expect(results[0].url).toBe(testUrl);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  expect(results[0].data.slideshow).toBeDefined();
});

test("fetchIfNeeded reuses cached results", async () => {
  const testUrl = "https://httpbin.org/json";

  // Make two requests to the same URL
  const id1 = await responseClient.action(api.index.fetchIfNeeded, {
    url: testUrl,
  });
  const id2 = await responseClient.action(api.index.fetchIfNeeded, {
    url: testUrl,
  });

  // Should return the same ID
  expect(id1).toBe(id2);

  // Should only have one cached result
  const results = await listTable(responseAdminClient, "fetchRequests");
  expect(results).toHaveLength(1);
});

test("fetchIfNeeded handles different URLs separately", async () => {
  const urls = [
    "https://httpbin.org/json",
    "https://httpbin.org/get",
  ];

  // Fetch both URLs
  const ids = await Promise.all(
    urls.map(async url => responseClient.action(api.index.fetchIfNeeded, { url }))
  );

  // Should get different IDs
  expect(ids[0]).not.toBe(ids[1]);

  // Should have two cached results
  const results = (await listTable(responseAdminClient, "fetchRequests")) as Doc<"fetchRequests">[];
  expect(results).toHaveLength(2);

  // Verify different data structures were cached
  const resultsByUrl = new Map(results.map(r => [r.url, r]));
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  expect(resultsByUrl.get(urls[0])?.data.slideshow).toBeDefined();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  expect(resultsByUrl.get(urls[1])?.data.url).toBeDefined();
});

test("handles concurrent requests to same URL", async () => {
  const testUrl = "https://httpbin.org/json";

  // Make multiple concurrent requests
  const ids = await Promise.all([
    responseClient.action(api.index.fetchIfNeeded, { url: testUrl }),
    responseClient.action(api.index.fetchIfNeeded, { url: testUrl }),
    responseClient.action(api.index.fetchIfNeeded, { url: testUrl }),
  ]);

  // All requests should return the same ID
  expect(new Set(ids).size).toBe(1);

  // Should only have one cached result
  const results = await listTable(responseAdminClient, "fetchRequests");
  expect(results).toHaveLength(1);
});

test("handles invalid URLs appropriately", async () => {
  const invalidUrl = "https://invalid-url-that-does-not-exist.example.com";

  await expect(
    responseClient.action(api.index.fetchIfNeeded, { url: invalidUrl })
  ).rejects.toThrow();

  // Should not cache failed requests
  const results = await listTable(responseAdminClient, "fetchRequests");
  expect(results).toHaveLength(0);
});