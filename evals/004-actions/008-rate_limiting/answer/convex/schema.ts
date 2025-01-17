import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  rate_limits: defineTable({
    identifier: v.string(),
    tokens: v.number(),
    lastRefill: v.number(),
    totalRequests: v.number(),
    limitExceeded: v.number(),
  }).index("by_identifier", ["identifier"]),

  api_logs: defineTable({
    identifier: v.string(),
    endpoint: v.string(),
    timestamp: v.number(),
    success: v.boolean(),
    errorCode: v.optional(v.string()),
    responseTime: v.number(),
  })
    .index("by_identifier", ["identifier"])
    .index("by_identifier_time", ["identifier", "timestamp"])
    .index("by_endpoint", ["endpoint"]),
}); 