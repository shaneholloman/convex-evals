import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Dashboard configuration
const DASHBOARD_CONFIG = {
  heartbeatInterval: 30,
  metricWindow: 3600,
  alertThresholds: {
    cpu_usage: 90,
    memory_usage: 85,
    error_rate: 5,
    latency: 1000,
  },
  components: ["api_server", "database", "cache", "worker_pool"],
};

export const recordMetric = mutation({
  args: {
    category: v.string(),
    name: v.string(),
    value: v.number(),
    unit: v.string(),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check alert thresholds
    if (args.name in DASHBOARD_CONFIG.alertThresholds) {
      const threshold = DASHBOARD_CONFIG.alertThresholds[args.name as keyof typeof DASHBOARD_CONFIG.alertThresholds];
      if (args.value > threshold) {
        await createAlert(ctx, {
          severity: "warning",
          message: `${args.name} exceeded threshold: ${args.value} ${args.unit} (threshold: ${threshold} ${args.unit})`,
          source: args.category,
        });
      }
    }

    // Clean up old metrics
    const cutoff = now - DASHBOARD_CONFIG.metricWindow * 1000;
    const oldMetrics = await ctx.db
      .query("metrics")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoff))
      .collect();

    for (const metric of oldMetrics) {
      await ctx.db.delete(metric._id);
    }

    // Record new metric
    return await ctx.db.insert("metrics", {
      timestamp: now,
      ...args,
    });
  },
});

export const createAlert = mutation({
  args: {
    severity: v.union(
      v.literal("info"),
      v.literal("warning"),
      v.literal("error"),
      v.literal("critical")
    ),
    message: v.string(),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("alerts", {
      timestamp: Date.now(),
      ...args,
      acknowledged: false,
    });
  },
});

export const acknowledgeAlert = mutation({
  args: {
    alertId: v.id("alerts"),
  },
  handler: async (ctx, args) => {
    const alert = await ctx.db.get(args.alertId);
    if (!alert) {
      throw new Error("Alert not found");
    }

    return await ctx.db.patch(args.alertId, {
      acknowledged: true,
    });
  },
});

export const resolveAlert = mutation({
  args: {
    alertId: v.id("alerts"),
  },
  handler: async (ctx, args) => {
    const alert = await ctx.db.get(args.alertId);
    if (!alert) {
      throw new Error("Alert not found");
    }

    return await ctx.db.patch(args.alertId, {
      resolvedAt: Date.now(),
    });
  },
});

export const updateSystemStatus = mutation({
  args: {
    component: v.string(),
    status: v.union(
      v.literal("healthy"),
      v.literal("degraded"),
      v.literal("down")
    ),
    message: v.string(),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    // Validate component
    if (!DASHBOARD_CONFIG.components.includes(args.component)) {
      throw new Error(`Invalid component: ${args.component}`);
    }

    const existing = await ctx.db
      .query("system_status")
      .withIndex("by_component", (q) => q.eq("component", args.component))
      .first();

    const now = Date.now();

    if (existing) {
      // If status degraded or down, create alert
      if (args.status !== "healthy" && existing.status === "healthy") {
        await createAlert(ctx, {
          severity: args.status === "down" ? "critical" : "warning",
          message: `${args.component} status changed to ${args.status}: ${args.message}`,
          source: args.component,
        });
      }

      return await ctx.db.patch(existing._id, {
        status: args.status,
        lastCheck: now,
        message: args.message,
        metadata: args.metadata,
      });
    }

    return await ctx.db.insert("system_status", {
      ...args,
      lastCheck: now,
    });
  },
}); 