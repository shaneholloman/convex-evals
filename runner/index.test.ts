import { describe, expect, it } from "bun:test";
import { buildEvalResult } from "./index.js";

describe("buildEvalResult", () => {
  it("fails eval when eslint fails even if tests pass", () => {
    const result = buildEvalResult(
      "000-fundamentals",
      "002-basic_http_endpoint",
      "test-model",
      [
        { name: "Valid filesystem output", score: 1 },
        { name: "`bun install` succeeds", score: 1 },
        { name: "`convex dev` succeeds", score: 1 },
        { name: "Passes tsc", score: 1 },
        { name: "Passes eslint", score: 0 },
        { name: "Tests pass", score: 1 },
      ],
      "C:/tmp/convex-evals",
    );

    expect(result.tests_pass_score).toBe(1);
    expect(result.passed).toBe(false);
    expect(result.failure_reason).toBe("eslint fail");
  });

  it("passes eval only when all scores are perfect", () => {
    const result = buildEvalResult(
      "000-fundamentals",
      "000-empty_functions",
      "test-model",
      [
        { name: "Valid filesystem output", score: 1 },
        { name: "`bun install` succeeds", score: 1 },
        { name: "`convex dev` succeeds", score: 1 },
        { name: "Passes tsc", score: 1 },
        { name: "Passes eslint", score: 1 },
        { name: "Tests pass", score: 1 },
      ],
      "C:/tmp/convex-evals",
    );

    expect(result.passed).toBe(true);
    expect(result.failure_reason).toBeNull();
    expect(result.tests_pass_score).toBe(1);
  });

  it("fails eval on partial test score", () => {
    const result = buildEvalResult(
      "002-queries",
      "015-pagination",
      "test-model",
      [
        { name: "Valid filesystem output", score: 1 },
        { name: "`bun install` succeeds", score: 1 },
        { name: "`convex dev` succeeds", score: 1 },
        { name: "Passes tsc", score: 1 },
        { name: "Passes eslint", score: 1 },
        { name: "Tests pass", score: 0.5 },
      ],
      "C:/tmp/convex-evals",
    );

    expect(result.passed).toBe(false);
    expect(result.failure_reason).toBe("tests fail");
    expect(result.tests_pass_score).toBe(0.5);
  });
});
