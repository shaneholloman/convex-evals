import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  metrics: defineTable({
    timestamp: v.number(),
    category: v.string(),
    name: v.string(),
    value: v.number(),
    unit: v.string(),
    tags: v.array(v.string()),
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_category_name", ["category", "name"])
    .index("by_name_timestamp", ["name", "timestamp"]),

  alerts: defineTable({
    timestamp: v.number(),
    severity: v.union(
      v.literal("info"),
      v.literal("warning"),
      v.literal("error"),
      v.literal("critical")
    ),
    message: v.string(),
    source: v.string(),
    acknowledged: v.boolean(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_severity", ["severity"])
    .index("by_source", ["source"])
    .index("by_acknowledged", ["acknowledged"]),

  system_status: defineTable({
    component: v.string(),
    status: v.union(
      v.literal("healthy"),
      v.literal("degraded"),
      v.literal("down")
    ),
    lastCheck: v.number(),
    message: v.string(),
    metadata: v.any(),
  })
    .index("by_component", ["component"])
    .index("by_status", ["status"])
    .index("by_last_check", ["lastCheck"]),
}); 