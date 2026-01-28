import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("computeMeanAndStdDev logic", () => {
  it("returns mean and standard deviation for two values", async () => {
    const t = convexTest(schema, modules);

    // Insert two runs with scores 80 and 60
    await t.mutation(internal.evalScores.updateScores, {
      model: "test-model",
      scores: { cat1: 60 },
      totalScore: 60,
    });
    await t.mutation(internal.evalScores.updateScores, {
      model: "test-model",
      scores: { cat1: 80 },
      totalScore: 80,
    });

    const results = await t.query(api.evalScores.listAllScores, {});

    expect(results).toHaveLength(1);
    const entry = results[0];

    // Mean of 60 and 80 is 70
    expect(entry.totalScore).toBe(70);
    // SD: sqrt(((60-70)^2 + (80-70)^2) / 2) = sqrt((100 + 100) / 2) = sqrt(100) = 10
    expect(entry.totalScoreErrorBar).toBe(10);

    expect(entry.scores.cat1).toBe(70);
    expect(entry.scoreErrorBars.cat1).toBe(10);
  });

  it("returns the single value with zero error bar for one run", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.evalScores.updateScores, {
      model: "single-run",
      scores: { cat1: 85 },
      totalScore: 85,
    });

    const results = await t.query(api.evalScores.listAllScores, {});

    const entry = results.find((e) => e.model === "single-run");
    expect(entry).toBeDefined();
    expect(entry!.totalScore).toBe(85);
    expect(entry!.totalScoreErrorBar).toBe(0);
    expect(entry!.scores.cat1).toBe(85);
    expect(entry!.scoreErrorBars.cat1).toBe(0);
  });

  it("computes mean and SD correctly for three values", async () => {
    const t = convexTest(schema, modules);

    // Insert three runs: 0.8, 0.9, 1.0
    // Mean = (0.8 + 0.9 + 1.0) / 3 = 0.9
    // SD = sqrt(((0.8-0.9)^2 + (0.9-0.9)^2 + (1.0-0.9)^2) / 3)
    //    = sqrt((0.01 + 0 + 0.01) / 3) = sqrt(0.02/3) ≈ 0.0816
    await t.mutation(internal.evalScores.updateScores, {
      model: "three-runs",
      scores: { cat1: 0.8 },
      totalScore: 0.8,
    });
    await t.mutation(internal.evalScores.updateScores, {
      model: "three-runs",
      scores: { cat1: 0.9 },
      totalScore: 0.9,
    });
    await t.mutation(internal.evalScores.updateScores, {
      model: "three-runs",
      scores: { cat1: 1.0 },
      totalScore: 1.0,
    });

    const results = await t.query(api.evalScores.listAllScores, {});

    const entry = results.find((e) => e.model === "three-runs");
    expect(entry).toBeDefined();
    expect(entry!.totalScore).toBeCloseTo(0.9);
    expect(entry!.totalScoreErrorBar).toBeCloseTo(0.0816, 3);
    expect(entry!.scores.cat1).toBeCloseTo(0.9);
    expect(entry!.scoreErrorBars.cat1).toBeCloseTo(0.0816, 3);
    expect(entry!.runCount).toBe(3);
  });

  it("only uses the last 5 runs for calculation", async () => {
    const t = convexTest(schema, modules);

    // Insert 7 runs: 10, 20, 30, 40, 50, 60, 70
    // Only the last 5 (30, 40, 50, 60, 70) should be used
    // Mean = (30 + 40 + 50 + 60 + 70) / 5 = 250 / 5 = 50
    // SD = sqrt(((30-50)^2 + (40-50)^2 + (50-50)^2 + (60-50)^2 + (70-50)^2) / 5)
    //    = sqrt((400 + 100 + 0 + 100 + 400) / 5) = sqrt(1000 / 5) = sqrt(200) ≈ 14.14
    for (const score of [10, 20, 30, 40, 50, 60, 70]) {
      await t.mutation(internal.evalScores.updateScores, {
        model: "many-runs",
        scores: { cat1: score },
        totalScore: score,
      });
    }

    const results = await t.query(api.evalScores.listAllScores, {});

    const entry = results.find((e) => e.model === "many-runs");
    expect(entry).toBeDefined();
    expect(entry!.totalScore).toBe(50);
    expect(entry!.totalScoreErrorBar).toBeCloseTo(14.14, 1);
    expect(entry!.runCount).toBe(7); // Total runs stored
  });

  it("handles multiple categories independently", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.evalScores.updateScores, {
      model: "multi-cat",
      scores: { catA: 100, catB: 50 },
      totalScore: 75,
    });
    await t.mutation(internal.evalScores.updateScores, {
      model: "multi-cat",
      scores: { catA: 80, catB: 70 },
      totalScore: 75,
    });

    const results = await t.query(api.evalScores.listAllScores, {});

    const entry = results.find((e) => e.model === "multi-cat");
    expect(entry).toBeDefined();

    // catA: mean = (100 + 80) / 2 = 90
    // SD = sqrt(((100-90)^2 + (80-90)^2) / 2) = sqrt((100 + 100) / 2) = 10
    expect(entry!.scores.catA).toBe(90);
    expect(entry!.scoreErrorBars.catA).toBe(10);

    // catB: mean = (50 + 70) / 2 = 60
    // SD = sqrt(((50-60)^2 + (70-60)^2) / 2) = sqrt((100 + 100) / 2) = 10
    expect(entry!.scores.catB).toBe(60);
    expect(entry!.scoreErrorBars.catB).toBe(10);

    // totalScore: both runs have 75, so mean=75, SD=0
    expect(entry!.totalScore).toBe(75);
    expect(entry!.totalScoreErrorBar).toBe(0);
  });
});

describe("getScores", () => {
  it("returns null when no scores exist for model", async () => {
    const t = convexTest(schema, modules);

    const result = await t.query(api.evalScores.getScores, {
      model: "nonexistent",
    });

    expect(result).toBeNull();
  });

  it("returns the latest score for a model", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.evalScores.updateScores, {
      model: "latest-test",
      scores: { cat1: 50 },
      totalScore: 50,
    });
    await t.mutation(internal.evalScores.updateScores, {
      model: "latest-test",
      scores: { cat1: 90 },
      totalScore: 90,
    });

    const result = await t.query(api.evalScores.getScores, {
      model: "latest-test",
    });

    expect(result).toMatchObject({
      model: "latest-test",
      scores: { cat1: 90 },
      totalScore: 90,
    });
  });
});

describe("listAllRuns", () => {
  it("returns empty array when no runs exist", async () => {
    const t = convexTest(schema, modules);

    const result = await t.query(api.evalScores.listAllRuns, {});

    expect(result).toEqual([]);
  });

  it("returns all individual runs ordered by creation time desc", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.evalScores.updateScores, {
      model: "model-a",
      scores: { cat1: 80 },
      totalScore: 80,
      runId: "run-1",
    });
    await t.mutation(internal.evalScores.updateScores, {
      model: "model-a",
      scores: { cat1: 90 },
      totalScore: 90,
      runId: "run-2",
    });

    const result = await t.query(api.evalScores.listAllRuns, {});

    expect(result).toHaveLength(2);
    expect(result[0].runId).toBe("run-2"); // Most recent first
    expect(result[1].runId).toBe("run-1");
  });

  it("respects the limit parameter", async () => {
    const t = convexTest(schema, modules);

    for (let i = 0; i < 5; i++) {
      await t.mutation(internal.evalScores.updateScores, {
        model: "model-limit",
        scores: { cat1: i * 10 },
        totalScore: i * 10,
      });
    }

    const result = await t.query(api.evalScores.listAllRuns, { limit: 2 });

    expect(result).toHaveLength(2);
  });

  it("filters by experiment when provided", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.evalScores.updateScores, {
      model: "model-exp",
      scores: { cat1: 80 },
      totalScore: 80,
    });
    await t.mutation(internal.evalScores.updateScores, {
      model: "model-exp",
      scores: { cat1: 90 },
      totalScore: 90,
      experiment: "no_guidelines",
    });

    // Default (no experiment filter) should only return the default run
    const defaultRuns = await t.query(api.evalScores.listAllRuns, {});
    expect(defaultRuns).toHaveLength(1);
    expect(defaultRuns[0].experiment).toBeUndefined();

    // Filter by experiment
    const expRuns = await t.query(api.evalScores.listAllRuns, {
      experiment: "no_guidelines",
    });
    expect(expRuns).toHaveLength(1);
    expect(expRuns[0].experiment).toBe("no_guidelines");

    // Include all experiments
    const allRuns = await t.query(api.evalScores.listAllRuns, {
      includeAllExperiments: true,
    });
    expect(allRuns).toHaveLength(2);
  });
});

describe("listAllScores with experiments", () => {
  it("filters by experiment when provided", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.evalScores.updateScores, {
      model: "model-a",
      scores: { cat1: 80 },
      totalScore: 80,
    });
    await t.mutation(internal.evalScores.updateScores, {
      model: "model-a",
      scores: { cat1: 70 },
      totalScore: 70,
      experiment: "no_guidelines",
    });

    // Default query (no experiment) should only include the default run
    const defaultScores = await t.query(api.evalScores.listAllScores, {});
    expect(defaultScores).toHaveLength(1);
    expect(defaultScores[0].totalScore).toBe(80);
    expect(defaultScores[0].totalScoreErrorBar).toBe(0);

    // Query with experiment filter
    const expScores = await t.query(api.evalScores.listAllScores, {
      experiment: "no_guidelines",
    });
    expect(expScores).toHaveLength(1);
    expect(expScores[0].totalScore).toBe(70);
    expect(expScores[0].totalScoreErrorBar).toBe(0);
  });
});

describe("getModelHistory", () => {
  it("returns empty array when no runs exist for model", async () => {
    const t = convexTest(schema, modules);

    const result = await t.query(api.evalScores.getModelHistory, {
      model: "nonexistent",
    });

    expect(result).toEqual([]);
  });

  it("returns runs in chronological order (oldest first)", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.evalScores.updateScores, {
      model: "history-test",
      scores: { cat1: 0.8 },
      totalScore: 0.8,
      runId: "run-1",
    });
    await t.mutation(internal.evalScores.updateScores, {
      model: "history-test",
      scores: { cat1: 0.9 },
      totalScore: 0.9,
      runId: "run-2",
    });
    await t.mutation(internal.evalScores.updateScores, {
      model: "history-test",
      scores: { cat1: 1.0 },
      totalScore: 1.0,
      runId: "run-3",
    });

    const result = await t.query(api.evalScores.getModelHistory, {
      model: "history-test",
    });

    expect(result).toHaveLength(3);
    // Should be in chronological order (oldest first)
    expect(result[0].runId).toBe("run-1");
    expect(result[0].totalScore).toBe(0.8);
    expect(result[1].runId).toBe("run-2");
    expect(result[1].totalScore).toBe(0.9);
    expect(result[2].runId).toBe("run-3");
    expect(result[2].totalScore).toBe(1.0);
  });

  it("filters by experiment when provided", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.evalScores.updateScores, {
      model: "exp-filter",
      scores: { cat1: 0.8 },
      totalScore: 0.8,
      runId: "default-1",
    });
    await t.mutation(internal.evalScores.updateScores, {
      model: "exp-filter",
      scores: { cat1: 0.7 },
      totalScore: 0.7,
      runId: "exp-1",
      experiment: "no_guidelines",
    });
    await t.mutation(internal.evalScores.updateScores, {
      model: "exp-filter",
      scores: { cat1: 0.9 },
      totalScore: 0.9,
      runId: "exp-2",
      experiment: "no_guidelines",
    });

    // Default query (no experiment) should only return default runs
    const defaultHistory = await t.query(api.evalScores.getModelHistory, {
      model: "exp-filter",
    });
    expect(defaultHistory).toHaveLength(1);
    expect(defaultHistory[0].runId).toBe("default-1");

    // Query with experiment filter
    const expHistory = await t.query(api.evalScores.getModelHistory, {
      model: "exp-filter",
      experiment: "no_guidelines",
    });
    expect(expHistory).toHaveLength(2);
    expect(expHistory[0].runId).toBe("exp-1");
    expect(expHistory[1].runId).toBe("exp-2");
  });

  it("respects limit parameter (returns most recent runs)", async () => {
    const t = convexTest(schema, modules);

    // Create 5 runs
    for (let i = 0; i < 5; i++) {
      await t.mutation(internal.evalScores.updateScores, {
        model: "limit-test",
        scores: { cat1: i * 0.1 },
        totalScore: i * 0.1,
        runId: `run-${i + 1}`,
      });
    }

    // Limit to 3 should return the last 3 runs (most recent)
    const result = await t.query(api.evalScores.getModelHistory, {
      model: "limit-test",
      limit: 3,
    });

    expect(result).toHaveLength(3);
    // Should still be in chronological order
    expect(result[0].runId).toBe("run-3");
    expect(result[1].runId).toBe("run-4");
    expect(result[2].runId).toBe("run-5");
  });

  it("only returns data for the specified model", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.evalScores.updateScores, {
      model: "model-a",
      scores: { cat1: 0.8 },
      totalScore: 0.8,
    });
    await t.mutation(internal.evalScores.updateScores, {
      model: "model-b",
      scores: { cat1: 0.9 },
      totalScore: 0.9,
    });

    const result = await t.query(api.evalScores.getModelHistory, {
      model: "model-a",
    });

    expect(result).toHaveLength(1);
    expect(result[0].totalScore).toBe(0.8);
  });

  it("includes all required fields", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.evalScores.updateScores, {
      model: "fields-test",
      scores: { cat1: 0.8, cat2: 0.9 },
      totalScore: 0.85,
      runId: "test-run",
    });

    const result = await t.query(api.evalScores.getModelHistory, {
      model: "fields-test",
    });

    expect(result).toHaveLength(1);
    const entry = result[0];
    expect(entry).toHaveProperty("_creationTime");
    expect(typeof entry._creationTime).toBe("number");
    expect(entry).toHaveProperty("totalScore");
    expect(entry.totalScore).toBe(0.85);
    expect(entry).toHaveProperty("scores");
    expect(entry.scores).toEqual({ cat1: 0.8, cat2: 0.9 });
    expect(entry).toHaveProperty("runId");
    expect(entry.runId).toBe("test-run");
  });
});
