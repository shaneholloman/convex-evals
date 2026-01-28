import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

const HISTORY_SIZE = 5;

/** Maximum age of runs to include in queries (90 days in milliseconds) */
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

const experimentLiteral = v.union(v.literal("no_guidelines"));

/**
 * Records scores for a model run. Always inserts a new record (append-only).
 */
export const updateScores = internalMutation({
  args: {
    model: v.string(),
    scores: v.record(v.string(), v.number()),
    totalScore: v.number(),
    runId: v.optional(v.string()),
    experiment: v.optional(experimentLiteral),
  },
  returns: v.id("evalScores"),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("evalScores", {
      model: args.model,
      scores: args.scores,
      totalScore: args.totalScore,
      runId: args.runId,
      experiment: args.experiment,
    });
    return id;
  },
});

/**
 * Retrieves the latest scores for a specific model.
 */
export const getScores = query({
  args: {
    model: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.id("evalScores"),
      model: v.string(),
      totalScore: v.number(),
      scores: v.record(v.string(), v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const scores = await ctx.db
      .query("evalScores")
      .withIndex("by_model", (q) => q.eq("model", args.model))
      .order("desc")
      .first();

    return scores;
  },
});

function computeMeanAndStdDev(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  if (values.length === 1) return { mean: values[0], stdDev: 0 };

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return { mean, stdDev };
}

/**
 * Lists all models with their mean scores and standard deviations.
 * Standard deviation is computed from the last N runs (population SD).
 * Only includes runs from the last 90 days.
 */
export const listAllScores = query({
  args: {
    experiment: v.optional(experimentLiteral),
  },
  returns: v.array(
    v.object({
      model: v.string(),
      totalScore: v.number(),
      totalScoreErrorBar: v.number(),
      scores: v.record(v.string(), v.number()),
      scoreErrorBars: v.record(v.string(), v.number()),
      runCount: v.number(),
      latestRunId: v.optional(v.string()),
      latestRunTime: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const cutoffTime = Date.now() - MAX_AGE_MS;

    const allScores = args.experiment
      ? await ctx.db
          .query("evalScores")
          .withIndex("by_experiment", (q) => q.eq("experiment", args.experiment))
          .collect()
      : await ctx.db
          .query("evalScores")
          .withIndex("by_experiment", (q) => q.eq("experiment", undefined))
          .collect();

    // Filter to only include runs within the date range
    const recentScores = allScores.filter((s) => s._creationTime >= cutoffTime);

    // Group by model
    const byModel = new Map<string, typeof recentScores>();
    for (const score of recentScores) {
      const existing = byModel.get(score.model) ?? [];
      existing.push(score);
      byModel.set(score.model, existing);
    }

    const results: Array<{
      model: string;
      totalScore: number;
      totalScoreErrorBar: number;
      scores: Record<string, number>;
      scoreErrorBars: Record<string, number>;
      runCount: number;
      latestRunId: string | undefined;
      latestRunTime: number;
    }> = [];

    for (const [model, runs] of byModel) {
      // Sort by creation time descending, take last N
      const sorted = runs.sort((a, b) => b._creationTime - a._creationTime);
      const recentRuns = sorted.slice(0, HISTORY_SIZE);
      const latest = recentRuns[0];

      // Compute mean and standard deviation for totalScore
      const totalScores = recentRuns.map((r) => r.totalScore);
      const { mean: totalScore, stdDev: totalScoreErrorBar } =
        computeMeanAndStdDev(totalScores);

      // Compute mean and error bars for each category
      const allCategories = new Set<string>();
      for (const run of recentRuns) {
        for (const cat of Object.keys(run.scores)) {
          allCategories.add(cat);
        }
      }

      const scores: Record<string, number> = {};
      const scoreErrorBars: Record<string, number> = {};
      for (const cat of allCategories) {
        const catScores = recentRuns
          .map((r) => r.scores[cat])
          .filter((s): s is number => s !== undefined);
        const { mean, stdDev } = computeMeanAndStdDev(catScores);
        scores[cat] = mean;
        scoreErrorBars[cat] = stdDev;
      }

      results.push({
        model,
        totalScore,
        totalScoreErrorBar,
        scores,
        scoreErrorBars,
        runCount: runs.length,
        latestRunId: latest.runId,
        latestRunTime: latest._creationTime,
      });
    }

    // Sort by model name for consistent ordering
    results.sort((a, b) => a.model.localeCompare(b.model));

    return results;
  },
});

/**
 * Lists all individual runs (not aggregated by model).
 * Pass includeAllExperiments=true to get all runs regardless of experiment.
 * Otherwise, pass experiment to filter by a specific experiment, or omit to get only default runs.
 * Only includes runs from the last 90 days.
 */
export const listAllRuns = query({
  args: {
    experiment: v.optional(experimentLiteral),
    includeAllExperiments: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("evalScores"),
      model: v.string(),
      totalScore: v.number(),
      scores: v.record(v.string(), v.number()),
      runId: v.optional(v.string()),
      experiment: v.optional(experimentLiteral),
      _creationTime: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const cutoffTime = Date.now() - MAX_AGE_MS;

    let allRuns;
    if (args.includeAllExperiments) {
      // Fetch all runs regardless of experiment
      allRuns = await ctx.db.query("evalScores").order("desc").collect();
    } else if (args.experiment) {
      allRuns = await ctx.db
        .query("evalScores")
        .withIndex("by_experiment", (q) => q.eq("experiment", args.experiment))
        .order("desc")
        .collect();
    } else {
      allRuns = await ctx.db
        .query("evalScores")
        .withIndex("by_experiment", (q) => q.eq("experiment", undefined))
        .order("desc")
        .collect();
    }

    // Filter to only include runs within the date range, then apply limit
    const recentRuns = allRuns.filter((r) => r._creationTime >= cutoffTime);
    const runs = args.limit ? recentRuns.slice(0, args.limit) : recentRuns;

    return runs.map((run) => ({
      _id: run._id,
      model: run.model,
      totalScore: run.totalScore,
      scores: run.scores,
      runId: run.runId,
      experiment: run.experiment,
      _creationTime: run._creationTime,
    }));
  },
});

/**
 * Gets historical run data for a specific model, ordered chronologically (oldest first).
 * Useful for displaying time-series charts of model performance over time.
 * Only includes runs from the last 90 days.
 */
export const getModelHistory = query({
  args: {
    model: v.string(),
    experiment: v.optional(experimentLiteral),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _creationTime: v.number(),
      totalScore: v.number(),
      scores: v.record(v.string(), v.number()),
      runId: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const cutoffTime = Date.now() - MAX_AGE_MS;

    // Query by model index
    let runs = await ctx.db
      .query("evalScores")
      .withIndex("by_model", (q) => q.eq("model", args.model))
      .collect();

    // Filter by date range and experiment
    runs = runs.filter((run) => run._creationTime >= cutoffTime);

    if (args.experiment !== undefined) {
      runs = runs.filter((run) => run.experiment === args.experiment);
    } else {
      // If no experiment specified, only get runs without experiment tag
      runs = runs.filter((run) => run.experiment === undefined);
    }

    // Sort by creation time ascending (oldest first) for chronological charting
    runs.sort((a, b) => a._creationTime - b._creationTime);

    // Apply limit if provided (take from the end since we want recent data)
    if (args.limit !== undefined && args.limit > 0) {
      runs = runs.slice(-args.limit);
    }

    return runs.map((run) => ({
      _creationTime: run._creationTime,
      totalScore: run.totalScore,
      scores: run.scores,
      runId: run.runId,
    }));
  },
});
