import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const initializeRateLimit = mutation({
  args: {
    identifier: v.string(),
    maxTokens: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("rate_limits")
      .withIndex("by_identifier", (q) => q.eq("identifier", args.identifier))
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("rate_limits", {
      identifier: args.identifier,
      tokens: args.maxTokens,
      lastRefill: Date.now(),
      totalRequests: 0,
      limitExceeded: 0,
    });
  },
});

export const updateRateLimit = mutation({
  args: {
    identifier: v.string(),
    tokens: v.number(),
    lastRefill: v.number(),
    incrementTotal: v.boolean(),
    incrementExceeded: v.boolean(),
  },
  handler: async (ctx, args) => {
    const rateLimit = await ctx.db
      .query("rate_limits")
      .withIndex("by_identifier", (q) => q.eq("identifier", args.identifier))
      .first();

    if (!rateLimit) {
      throw new Error("Rate limit not found");
    }

    return await ctx.db.patch(rateLimit._id, {
      tokens: args.tokens,
      lastRefill: args.lastRefill,
      totalRequests: args.incrementTotal ? rateLimit.totalRequests + 1 : rateLimit.totalRequests,
      limitExceeded: args.incrementExceeded ? rateLimit.limitExceeded + 1 : rateLimit.limitExceeded,
    });
  },
});

export const logApiRequest = mutation({
  args: {
    identifier: v.string(),
    endpoint: v.string(),
    timestamp: v.number(),
    success: v.boolean(),
    errorCode: v.optional(v.string()),
    responseTime: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("api_logs", args);
  },
}); 