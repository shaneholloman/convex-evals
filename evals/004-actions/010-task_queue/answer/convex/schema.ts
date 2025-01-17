import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  tasks: defineTable({
    id: v.string(),
    type: v.string(),
    priority: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    data: v.any(),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    attempts: v.number(),
    nextRetry: v.optional(v.number()),
  })
    .index("by_id", ["id"])
    .index("by_status", ["status"])
    .index("by_priority_status", ["priority", "status"])
    .index("by_type_status", ["type", "status"])
    .index("by_next_retry", ["nextRetry"]),

  task_metrics: defineTable({
    timestamp: v.number(),
    taskType: v.string(),
    totalTasks: v.number(),
    completedTasks: v.number(),
    failedTasks: v.number(),
    avgProcessingTime: v.number(),
    maxConcurrent: v.number(),
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_type", ["taskType"]),
}); 