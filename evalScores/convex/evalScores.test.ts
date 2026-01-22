import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("computeMeanAndErrorBar logic", () => {
  it("returns midpoint and half-range for two values", async () => {
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

    // Midpoint of 60 and 80 is 70
    expect(entry.totalScore).toBe(70);
    // Error bar is (80 - 60) / 2 = 10
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

  it("computes midpoint correctly for three values", async () => {
    const t = convexTest(schema, modules);

    // Insert three runs: 0.8, 0.9, 1.0
    // Min = 0.8, Max = 1.0
    // Midpoint = (0.8 + 1.0) / 2 = 0.9
    // Error bar = (1.0 - 0.8) / 2 = 0.1
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
    expect(entry!.totalScoreErrorBar).toBeCloseTo(0.1);
    expect(entry!.scores.cat1).toBeCloseTo(0.9);
    expect(entry!.scoreErrorBars.cat1).toBeCloseTo(0.1);
    expect(entry!.runCount).toBe(3);
  });

  it("only uses the last 5 runs for calculation", async () => {
    const t = convexTest(schema, modules);

    // Insert 7 runs: 10, 20, 30, 40, 50, 60, 70
    // Only the last 5 (30, 40, 50, 60, 70) should be used
    // Min = 30, Max = 70
    // Midpoint = (30 + 70) / 2 = 50
    // Error bar = (70 - 30) / 2 = 20
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
    expect(entry!.totalScoreErrorBar).toBe(20);
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

    // catA: min=80, max=100, midpoint=90, errorBar=10
    expect(entry!.scores.catA).toBe(90);
    expect(entry!.scoreErrorBars.catA).toBe(10);

    // catB: min=50, max=70, midpoint=60, errorBar=10
    expect(entry!.scores.catB).toBe(60);
    expect(entry!.scoreErrorBars.catB).toBe(10);

    // totalScore: both runs have 75, so midpoint=75, errorBar=0
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
