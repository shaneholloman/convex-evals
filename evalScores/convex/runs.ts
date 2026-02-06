import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { experimentLiteral, runStatus, evalStatus } from "./schema.js";

export const createRun = internalMutation({
  args: {
    model: v.string(),
    provider: v.optional(v.string()),
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
      provider: v.optional(v.string()),
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
