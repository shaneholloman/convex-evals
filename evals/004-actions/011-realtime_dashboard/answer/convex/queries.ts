import { query } from "./_generated/server";
import { v } from "convex/values";

export const getMetrics = query({
  args: {
    since: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("metrics")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", args.since))
      .collect();
  },
});

export const getActiveAlerts = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("alerts")
      .withIndex("by_acknowledged", (q) => q.eq("acknowledged", false))
      .filter((alert) => !alert.resolvedAt)
      .collect();
  },
});

export const getSystemStatus = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("system_status")
      .withIndex("by_last_check", (q) => q.gte("lastCheck", Date.now() - 300000)) // Last 5 minutes
      .collect();
  },
}); 