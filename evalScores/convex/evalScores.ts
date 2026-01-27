import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

const HISTORY_SIZE = 5;

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
    const allScores = args.experiment
      ? await ctx.db
          .query("evalScores")
          .withIndex("by_experiment", (q) => q.eq("experiment", args.experiment))
          .collect()
      : await ctx.db
          .query("evalScores")
          .withIndex("by_experiment", (q) => q.eq("experiment", undefined))
          .collect();

    // Group by model
    const byModel = new Map<string, typeof allScores>();
    for (const score of allScores) {
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

    // Apply limit if provided
    const runs = args.limit ? allRuns.slice(0, args.limit) : allRuns;

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
