import { expect, test } from "vitest";
import { siteUrl } from "../../../grader";

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 3,
  delayMs = 1000,
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
  throw new Error("unreachable");
}

test("GET /api/hello returns body + 'there' (empty body => 'there')", async () => {
  const res = await fetchWithRetry(`${siteUrl}/api/hello`, { method: "GET" });
  expect(res.ok).toBe(true);
  const text = await res.text();
  expect(text).toBe("there");
  const contentType = res.headers.get("content-type");
  expect(contentType && contentType.includes("text/plain")).toBe(true);
});

test("POST /api/messages/* returns empty response body", async () => {
  const res = await fetchWithRetry(`${siteUrl}/api/messages/123`, {
    method: "POST",
    body: "ignored",
  });
  expect(res.ok).toBe(true);
  const text = await res.text();
  expect(text).toBe("");
});
