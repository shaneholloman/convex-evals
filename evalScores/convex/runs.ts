import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { experimentLiteral, runStatus, evalStatus } from "./schema.js";

/** Number of recent runs to use for mean/stddev computation in leaderboard */
const LEADERBOARD_HISTORY_SIZE = 5;

/** Maximum age of runs to include in leaderboard queries (60 days in ms) */
const LEADERBOARD_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

export const createRun = internalMutation({
  args: {
    model: v.string(),
    formattedName: v.string(),
    provider: v.string(),
    runId: v.optional(v.string()),
    plannedEvals: v.array(v.string()),
    experiment: v.optional(experimentLiteral),
  },
  returns: v.id("runs"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const expName = args.experiment ?? "default";
    
    // Create the run
    const id = await ctx.db.insert("runs", {
      model: args.model,
      formattedName: args.formattedName,
      provider: args.provider,
      runId: args.runId,
      plannedEvals: args.plannedEvals,
      status: { kind: "pending" },
      experiment: args.experiment,
    });
    
    // Update experiment stats
    const existing = await ctx.db
      .query("experiments")
      .withIndex("by_name", (q) => q.eq("name", expName))
      .unique();
    
    if (existing) {
      const models = existing.models.includes(args.model)
        ? existing.models
        : [...existing.models, args.model];
      await ctx.db.patch(existing._id, {
        runCount: existing.runCount + 1,
        models,
        latestRunTime: now,
      });
    } else {
      await ctx.db.insert("experiments", {
        name: expName,
        runCount: 1,
        completedRuns: 0,
        totalEvals: 0,
        passedEvals: 0,
        models: [args.model],
        latestRunTime: now,
      });
    }
    
    return id;
  },
});

export const updateRunStatus = internalMutation({
  args: {
    runId: v.id("runs"),
    status: runStatus,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: args.status,
    });
    return null;
  },
});

export const completeRun = internalMutation({
  args: {
    runId: v.id("runs"),
    status: v.union(
      v.object({ kind: v.literal("completed"), durationMs: v.number() }),
      v.object({ kind: v.literal("failed"), failureReason: v.string(), durationMs: v.number() }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    
    await ctx.db.patch(args.runId, {
      status: args.status,
    });
    
    // Update experiment completed run count
    const expName = run.experiment ?? "default";
    const experiment = await ctx.db
      .query("experiments")
      .withIndex("by_name", (q) => q.eq("name", expName))
      .unique();
    
    if (experiment && args.status.kind === "completed") {
      await ctx.db.patch(experiment._id, {
        completedRuns: experiment.completedRuns + 1,
      });
    }
    
    return null;
  },
});

export const getRunDetails = query({
  args: {
    runId: v.id("runs"),
  },
  returns: v.union(
    v.object({
      _id: v.id("runs"),
      model: v.string(),
      provider: v.string(),
      runId: v.optional(v.string()),
      plannedEvals: v.array(v.string()),
      status: runStatus,
      experiment: v.optional(experimentLiteral),
      _creationTime: v.number(),
      evals: v.array(
        v.object({
          _id: v.id("evals"),
          runId: v.id("runs"),
          evalPath: v.string(),
          category: v.string(),
          name: v.string(),
          status: evalStatus,
          task: v.optional(v.string()),
          evalSourceStorageId: v.optional(v.id("_storage")),
          _creationTime: v.number(),
          steps: v.array(
            v.object({
              _id: v.id("steps"),
              evalId: v.id("evals"),
              name: v.union(
                v.literal("filesystem"),
                v.literal("install"),
                v.literal("deploy"),
                v.literal("tsc"),
                v.literal("eslint"),
                v.literal("tests"),
              ),
              status: v.union(
                v.object({ kind: v.literal("running") }),
                v.object({ kind: v.literal("passed"), durationMs: v.number() }),
                v.object({ kind: v.literal("failed"), failureReason: v.string(), durationMs: v.number() }),
                v.object({ kind: v.literal("skipped") }),
              ),
              _creationTime: v.number(),
            }),
          ),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;

    const evals = await ctx.db
      .query("evals")
      .withIndex("by_runId", (q) => q.eq("runId", args.runId))
      .collect();

    const evalsWithSteps = await Promise.all(
      evals.map(async (evalItem) => {
        const steps = await ctx.db
          .query("steps")
          .withIndex("by_evalId", (q) => q.eq("evalId", evalItem._id))
          .collect();
        return {
          _id: evalItem._id,
          runId: evalItem.runId,
          evalPath: evalItem.evalPath,
          category: evalItem.category,
          name: evalItem.name,
          status: evalItem.status,
          task: evalItem.task,
          evalSourceStorageId: evalItem.evalSourceStorageId,
          _creationTime: evalItem._creationTime,
          steps: steps.map((step) => ({
            _id: step._id,
            evalId: step.evalId,
            name: step.name,
            status: step.status,
            _creationTime: step._creationTime,
          })),
        };
      }),
    );

    return {
      _id: run._id,
      model: run.model,
      provider: run.provider,
      runId: run.runId,
      plannedEvals: run.plannedEvals,
      status: run.status,
      experiment: run.experiment,
      _creationTime: run._creationTime,
      evals: evalsWithSteps,
    };
  },
});

// Get a download URL for an output file
export const getOutputUrl = query({
  args: {
    storageId: v.id("_storage"),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const url = await ctx.storage.getUrl(args.storageId);
    return url;
  },
});

// List all runs with optional filtering
export const listRuns = query({
  args: {
    experiment: v.optional(experimentLiteral),
    model: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let runsQuery = ctx.db.query("runs").order("desc");
    
    // Apply filters if provided
    if (args.experiment) {
      runsQuery = ctx.db
        .query("runs")
        .withIndex("by_experiment", (q) => q.eq("experiment", args.experiment))
        .order("desc");
    } else if (args.model) {
      const model = args.model;
      runsQuery = ctx.db
        .query("runs")
        .withIndex("by_model", (q) => q.eq("model", model))
        .order("desc");
    }
    
    const limit = args.limit ?? 100;
    const runs = await runsQuery.take(limit);
    
    // Fetch eval counts for each run
    const runsWithCounts = await Promise.all(
      runs.map(async (run) => {
        const evals = await ctx.db
          .query("evals")
          .withIndex("by_runId", (q) => q.eq("runId", run._id))
          .collect();
        
        const passedCount = evals.filter((e) => e.status.kind === "passed").length;
        const failedCount = evals.filter((e) => e.status.kind === "failed").length;
        const totalCount = evals.length;
        
        return {
          ...run,
          evalCounts: {
            total: totalCount,
            passed: passedCount,
            failed: failedCount,
            pending: totalCount - passedCount - failedCount,
          },
        };
      }),
    );
    
    return runsWithCounts;
  },
});

// List all experiments with their denormalized stats
export const listExperiments = query({
  args: {},
  handler: async (ctx) => {
    const experiments = await ctx.db.query("experiments").collect();
    
    // Transform to expected format and sort by latest run
    const result = experiments.map((exp) => ({
      name: exp.name,
      runCount: exp.runCount,
      modelCount: exp.models.length,
      models: exp.models,
      latestRun: exp.latestRunTime,
      totalEvals: exp.totalEvals,
      passedEvals: exp.passedEvals,
      passRate: exp.totalEvals > 0 ? exp.passedEvals / exp.totalEvals : 0,
      completedRuns: exp.completedRuns,
    }));
    
    // Sort by latest run (most recent first)
    result.sort((a, b) => b.latestRun - a.latestRun);
    
    return result;
  },
});

// ── Leaderboard queries (computed from runs + evals) ─────────────────

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
 * Compute scores for a single run from its evals.
 * Returns category pass rates and overall pass rate.
 */
function computeRunScoresFromEvals(
  evals: Doc<"evals">[],
): { totalScore: number; scores: Record<string, number> } {
  // Only count completed evals (passed or failed)
  const completedEvals = evals.filter(
    (e) => e.status.kind === "passed" || e.status.kind === "failed",
  );

  if (completedEvals.length === 0) {
    return { totalScore: 0, scores: {} };
  }

  // Group by category
  const byCategory = new Map<string, { passed: number; total: number }>();
  let totalPassed = 0;

  for (const evalItem of completedEvals) {
    const cat = evalItem.category;
    const existing = byCategory.get(cat) ?? { passed: 0, total: 0 };
    existing.total++;
    if (evalItem.status.kind === "passed") {
      existing.passed++;
      totalPassed++;
    }
    byCategory.set(cat, existing);
  }

  const scores: Record<string, number> = {};
  for (const [cat, stats] of byCategory) {
    scores[cat] = stats.total > 0 ? stats.passed / stats.total : 0;
  }

  const totalScore = completedEvals.length > 0 ? totalPassed / completedEvals.length : 0;

  return { totalScore, scores };
}

/**
 * Lists all models with their mean scores and standard deviations.
 * Computed on-demand from the runs and evals tables (single source of truth).
 * Standard deviation is computed from the last N runs (population SD).
 * Only includes completed runs.
 */
export const leaderboardScores = query({
  args: {
    experiment: v.optional(experimentLiteral),
  },
  returns: v.array(
    v.object({
      model: v.string(),
      formattedName: v.string(),
      totalScore: v.number(),
      totalScoreErrorBar: v.number(),
      scores: v.record(v.string(), v.number()),
      scoreErrorBars: v.record(v.string(), v.number()),
      runCount: v.number(),
      latestRunId: v.id("runs"),
      latestRunTime: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    // Fetch completed runs, filtered by experiment and limited to last 60 days
    const sixtyDaysAgo = Date.now() - LEADERBOARD_MAX_AGE_MS;
    const allRuns = await ctx.db
      .query("runs")
      .withIndex("by_experiment", (q) =>
        q.eq("experiment", args.experiment).gte("_creationTime", sixtyDaysAgo))
      .order("desc")
      .collect();

    // Only include completed runs
    const completedRuns = allRuns.filter((r) => r.status.kind === "completed");

    // Group by model
    const byModel = new Map<string, typeof completedRuns>();
    for (const run of completedRuns) {
      const existing = byModel.get(run.model) ?? [];
      existing.push(run);
      byModel.set(run.model, existing);
    }

    const results: Array<{
      model: string;
      formattedName: string;
      totalScore: number;
      totalScoreErrorBar: number;
      scores: Record<string, number>;
      scoreErrorBars: Record<string, number>;
      runCount: number;
      latestRunId: Id<"runs">;
      latestRunTime: number;
    }> = [];

    for (const [model, runs] of byModel) {
      // Already sorted desc by _creationTime, take last N
      const recentRuns = runs.slice(0, LEADERBOARD_HISTORY_SIZE);
      const latest = recentRuns[0];

      // Compute scores for each recent run
      const runScores = await Promise.all(
        recentRuns.map(async (run) => {
          const evals = await ctx.db
            .query("evals")
            .withIndex("by_runId", (q) => q.eq("runId", run._id))
            .collect();
          return computeRunScoresFromEvals(evals);
        }),
      );

      // Compute mean and standard deviation for totalScore
      const totalScores = runScores.map((rs) => rs.totalScore);
      const { mean: totalScore, stdDev: totalScoreErrorBar } =
        computeMeanAndStdDev(totalScores);

      // Compute mean and error bars for each category
      const allCategories = new Set<string>();
      for (const rs of runScores) {
        for (const cat of Object.keys(rs.scores)) {
          allCategories.add(cat);
        }
      }

      const scores: Record<string, number> = {};
      const scoreErrorBars: Record<string, number> = {};
      for (const cat of allCategories) {
        const catScores = runScores
          .map((rs) => rs.scores[cat])
          .filter((s): s is number => s !== undefined);
        const { mean, stdDev } = computeMeanAndStdDev(catScores);
        scores[cat] = mean;
        scoreErrorBars[cat] = stdDev;
      }

      results.push({
        model,
        formattedName: latest.formattedName,
        totalScore,
        totalScoreErrorBar,
        scores,
        scoreErrorBars,
        runCount: runs.length,
        latestRunId: latest._id,
        latestRunTime: latest._creationTime,
      });
    }

    // Sort by model name for consistent ordering
    results.sort((a, b) => a.model.localeCompare(b.model));

    return results;
  },
});

/**
 * Gets historical run data for a specific model, ordered chronologically (oldest first).
 * Computed on-demand from the runs and evals tables.
 * Useful for displaying time-series charts of model performance over time.
 */
export const leaderboardModelHistory = query({
  args: {
    model: v.string(),
    experiment: v.optional(experimentLiteral),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _creationTime: v.number(),
      runId: v.id("runs"),
      totalScore: v.number(),
      scores: v.record(v.string(), v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    // Fetch runs for this model, limited to last 60 days, ordered chronologically
    const sixtyDaysAgo = Date.now() - LEADERBOARD_MAX_AGE_MS;
    let runs = await ctx.db
      .query("runs")
      .withIndex("by_model", (q) =>
        q.eq("model", args.model).gte("_creationTime", sixtyDaysAgo))
      .order("asc")
      .collect();

    // Filter by experiment
    if (args.experiment !== undefined) {
      runs = runs.filter((run) => run.experiment === args.experiment);
    } else {
      // If no experiment specified, only get runs without experiment tag
      runs = runs.filter((run) => run.experiment === undefined);
    }

    // Only include completed runs
    runs = runs.filter((r) => r.status.kind === "completed");

    // Apply limit if provided (take from the end since we want recent data)
    if (args.limit !== undefined && args.limit > 0) {
      runs = runs.slice(-args.limit);
    }

    // Compute scores for each run
    const results = await Promise.all(
      runs.map(async (run) => {
        const evals = await ctx.db
          .query("evals")
          .withIndex("by_runId", (q) => q.eq("runId", run._id))
          .collect();
        const { totalScore, scores } = computeRunScoresFromEvals(evals);
        return {
          _creationTime: run._creationTime,
          runId: run._id,
          totalScore,
          scores,
        };
      }),
    );

    return results;
  },
});

// ── Visualiser queries ───────────────────────────────────────────────

// List all models with aggregated stats (limited to last 90 days)
export const listModels = query({
  args: {},
  handler: async (ctx) => {
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    
    // Get all runs from the last 90 days
    const runs = await ctx.db
      .query("runs")
      .order("desc")
      .filter((q) => q.gte(q.field("_creationTime"), ninetyDaysAgo))
      .collect();
    
    // Aggregate stats by model
    const modelStats = new Map<string, {
      runCount: number;
      experiments: Set<string>;
      latestRunTime: number;
      runIds: Id<"runs">[];
    }>();
    
    for (const run of runs) {
      const existing = modelStats.get(run.model);
      const expName = run.experiment ?? "default";
      
      if (existing) {
        existing.runCount += 1;
        existing.experiments.add(expName);
        if (run._creationTime > existing.latestRunTime) {
          existing.latestRunTime = run._creationTime;
        }
        existing.runIds.push(run._id);
      } else {
        modelStats.set(run.model, {
          runCount: 1,
          experiments: new Set([expName]),
          latestRunTime: run._creationTime,
          runIds: [run._id],
        });
      }
    }
    
    // Fetch eval counts for pass rate calculation
    const result = await Promise.all(
      Array.from(modelStats.entries()).map(async ([model, stats]) => {
        let totalEvals = 0;
        let passedEvals = 0;
        
        // Only check evals for the most recent 10 runs per model to avoid excessive queries
        const recentRunIds = stats.runIds.slice(0, 10);
        for (const runId of recentRunIds) {
          const evals = await ctx.db
            .query("evals")
            .withIndex("by_runId", (q) => q.eq("runId", runId))
            .collect();
          
          totalEvals += evals.length;
          passedEvals += evals.filter((e) => e.status.kind === "passed").length;
        }
        
        return {
          name: model,
          runCount: stats.runCount,
          experimentCount: stats.experiments.size,
          experiments: Array.from(stats.experiments),
          latestRun: stats.latestRunTime,
          totalEvals,
          passedEvals,
          passRate: totalEvals > 0 ? passedEvals / totalEvals : 0,
        };
      })
    );
    
    // Sort by latest run (most recent first)
    result.sort((a, b) => b.latestRun - a.latestRun);
    
    return result;
  },
});
