import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    status: v.union(v.literal("pending"), v.literal("processed"), v.literal("failed")),
    lastProcessed: v.optional(v.number()),
    retryCount: v.number(),
    metadata: v.any(),
  }),

  jobs: defineTable({
    jobId: v.string(),
    type: v.string(),
    status: v.union(v.literal("running"), v.literal("completed"), v.literal("failed")),
    progress: v.number(),
    totalItems: v.number(),
    processedItems: v.number(),
    error: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_job_id", ["jobId"]),

  audit_logs: defineTable({
    userId: v.id("users"),
    action: v.string(),
    timestamp: v.number(),
    details: v.any(),
    status: v.union(v.literal("success"), v.literal("failure")),
  }).index("by_user", ["userId"]),
}); 