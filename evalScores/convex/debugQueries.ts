/**
 * Internal queries used by the debug action.
 * Separated into their own module to avoid circular type inference.
 */
import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const getEvalRecord = internalQuery({
  args: { evalId: v.id("evals") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.evalId);
  },
});

export const getStepsForEval = internalQuery({
  args: { evalId: v.id("evals") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("steps")
      .withIndex("by_evalId", (q) => q.eq("evalId", args.evalId))
      .collect();
  },
});

export const getRunRecord = internalQuery({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId);
  },
});
