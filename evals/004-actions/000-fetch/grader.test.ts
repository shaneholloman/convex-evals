import { expect, test } from "vitest";
import { responseClient } from "../../../grader";
import { api } from "./answer/convex/_generated/api";

// httpbin.org occasionally returns transient 502/503 errors. Retry the action
// a few times so a single bad-gateway doesn't fail an otherwise-correct model.
async function fetchWithRetry(maxRetries = 3): Promise<unknown> {
  let lastError: unknown;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await responseClient.action(api.index.fetchFromHttpBin, {});
    } catch (e) {
      lastError = e;
      // Wait a bit before retrying (exponential backoff)
      if (i < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }
  throw lastError;
}

test("fetches data from httpbin", async () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const response: any = await fetchWithRetry();

  // Verify response structure
  expect(response).toBeDefined();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  expect(response.url).toBe("https://httpbin.org/get");
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  expect(response.headers).toBeDefined();
});

test("response contains standard httpbin fields", async () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const response: any = await fetchWithRetry();

  // Check for standard httpbin response fields
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  expect(response.origin).toBeDefined();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  expect(response.headers).toHaveProperty("Host");
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  expect(response.headers).toHaveProperty("Accept");
});

test("returns valid JSON", async () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const response: any = await fetchWithRetry();

  // Verify we can stringify and parse the response
  const jsonString = JSON.stringify(response);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  expect(() => JSON.parse(jsonString)).not.toThrow();
});
