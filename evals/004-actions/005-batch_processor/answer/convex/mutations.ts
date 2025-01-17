import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const createJob = mutation({
  args: {
    jobId: v.string(),
    type: v.string(),
    totalItems: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("jobs", {
      ...args,
      status: "running",
      progress: 0,
      processedItems: 0,
      startedAt: Date.now(),
    });
  },
});

export const updateJobProgress = mutation({
  args: {
    jobId: v.string(),
    processedItems: v.number(),
    progress: v.number(),
    status: v.union(v.literal("running"), v.literal("completed"), v.literal("failed")),
    error: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("jobs")
      .withIndex("by_job_id", (q) => q.eq("jobId", args.jobId))
      .unique();

    if (!job) {
      throw new Error(`Job ${args.jobId} not found`);
    }

    return await ctx.db.patch(job._id, {
      processedItems: args.processedItems,
      progress: args.progress,
      status: args.status,
      error: args.error,
      completedAt: args.completedAt,
    });
  },
});

export const updateUserStatus = mutation({
  args: {
    userId: v.id("users"),
    status: v.union(v.literal("processed"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error(`User ${args.userId} not found`);
    }

    return await ctx.db.patch(args.userId, {
      status: args.status,
      lastProcessed: Date.now(),
      retryCount: (user.retryCount ?? 0) + 1,
    });
  },
});

export const createAuditLog = mutation({
  args: {
    userId: v.id("users"),
    action: v.string(),
    details: v.any(),
    status: v.union(v.literal("success"), v.literal("failure")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("audit_logs", {
      ...args,
      timestamp: Date.now(),
    });
  },
}); 