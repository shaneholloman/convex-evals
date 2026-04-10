import { describe, expect, it } from "vitest";
import { getTextOutputEvalIncompatibilityReason } from "../runner/models/openRouterDiscovery.js";
import {
  selectTopModels as selectTopOpenRouterModels,
  shouldSkipForProviderError,
  shouldSkipForMissingEndpoint,
} from "./listTopOpenRouterModels.js";
import {
  extractEscapedJsonArray,
  selectTopModels as selectTopBenchmarkModels,
} from "./listTopOpenRouterBenchmarkModels.js";
import { mergeModelSources } from "./listPeriodicModels.js";

describe("top OpenRouter selector helpers", () => {
  it("deduplicates while preserving ranking order", () => {
    expect(
      selectTopOpenRouterModels(["a", "b", "a", "c", "d"], 3),
    ).toEqual(["a", "b", "c"]);
  });

  it("skips provider 400 preflight failures", () => {
    expect(
      shouldSkipForProviderError(
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
    expect(shouldSkipForProviderError(error)).toBe(false);
    expect(shouldSkipForMissingEndpoint(error)).toBe(false);
  });
});

describe("OpenRouter capability helpers", () => {
  it("allows multimodal input when output is text-only", () => {
    expect(
      getTextOutputEvalIncompatibilityReason({
        inputModalities: ["text", "image", "file"],
        outputModalities: ["text"],
      }),
    ).toBeNull();
  });

  it("rejects mixed output modalities", () => {
    expect(
      getTextOutputEvalIncompatibilityReason({
        inputModalities: ["text", "image"],
        outputModalities: ["text", "audio"],
      }),
    ).toBe("output modalities [text, audio] are not text-only");
  });

  it("rejects non-text output modalities", () => {
    expect(
      getTextOutputEvalIncompatibilityReason({
        inputModalities: ["text"],
        outputModalities: ["rerank"],
      }),
    ).toBe("output modalities [rerank] are not text-only");
  });

  it("rejects models whose input does not include text", () => {
    expect(
      getTextOutputEvalIncompatibilityReason({
        inputModalities: ["image", "audio"],
        outputModalities: ["text"],
      }),
    ).toBe("input modalities [image, audio] do not include text");
  });

  it("falls back to hasTextOutput when output modalities are missing", () => {
    expect(
      getTextOutputEvalIncompatibilityReason({
        hasTextOutput: false,
      }),
    ).toBe("model does not have text output");
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

describe("periodic selector helpers", () => {
  it("merges sources and deduplicates in source order", () => {
    expect(
      mergeModelSources([
        ["curated", ["a", "b"]],
        ["top-day", ["b", "c"]],
        ["benchmark", ["c", "d", "a"]],
      ]),
    ).toEqual({
      models: ["a", "b", "c", "d"],
      modelSources: {
        a: ["curated", "benchmark"],
        b: ["curated", "top-day"],
        c: ["top-day", "benchmark"],
        d: ["benchmark"],
      },
    });
  });
});
