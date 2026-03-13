import { describe, expect, it } from "vitest";
import {
  selectTopModels as selectTopOpenRouterModels,
  shouldKeepDespitePreflightFailure,
  shouldSkipForMissingEndpoint,
} from "./listTopOpenRouterModels.js";
import {
  extractEscapedJsonArray,
  selectTopModels as selectTopBenchmarkModels,
} from "./listTopOpenRouterBenchmarkModels.js";

describe("top OpenRouter selector helpers", () => {
  it("deduplicates while preserving ranking order", () => {
    expect(
      selectTopOpenRouterModels(["a", "b", "a", "c", "d"], 3),
    ).toEqual(["a", "b", "c"]);
  });

  it("keeps provider 400 preflight failures", () => {
    expect(
      shouldKeepDespitePreflightFailure(
        new Error("400 Bad Request: Provider returned error"),
      ),
    ).toBe(true);
  });

  it("skips missing-endpoint preflight failures", () => {
    expect(
      shouldSkipForMissingEndpoint(
        new Error("404 Not Found: No endpoints found for foo/bar."),
      ),
    ).toBe(true);
  });

  it("does not treat unrelated errors as keepable or skippable", () => {
    const error = new Error("500 Internal Server Error");
    expect(shouldKeepDespitePreflightFailure(error)).toBe(false);
    expect(shouldSkipForMissingEndpoint(error)).toBe(false);
  });
});

describe("benchmark selector helpers", () => {
  it("extracts the escaped benchmark array from rankings HTML", () => {
    const html =
      'prefix \\"agentic\\":[{\\"openrouter_slug\\":\\"foo/bar\\",\\"score\\":10}],\\"coding\\":[1] suffix';
    expect(extractEscapedJsonArray(html, "agentic")).toBe(
      '[{\\"openrouter_slug\\":\\"foo/bar\\",\\"score\\":10}]',
    );
  });

  it("selects top benchmark models by score", () => {
    const rows = [
      { openrouter_slug: "foo/bar", score: 10 },
      { openrouter_slug: "baz/qux", score: 30 },
      { heuristic_openrouter_slug: "fallback/model", score: 20 },
    ];
    expect(selectTopBenchmarkModels(rows, 3)).toEqual([
      "baz/qux",
      "fallback/model",
      "foo/bar",
    ]);
  });

  it("deduplicates and skips rows with no usable slug", () => {
    const rows = [
      { openrouter_slug: "foo/bar", score: 30 },
      { openrouter_slug: "foo/bar", score: 25 },
      { heuristic_openrouter_slug: "baz/qux", score: 20 },
      { score: 15 },
    ];
    expect(selectTopBenchmarkModels(rows, 3)).toEqual(["foo/bar", "baz/qux"]);
  });
});
