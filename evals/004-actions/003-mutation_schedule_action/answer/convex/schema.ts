import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  requests: defineTable({
    url: v.string(),
    status: v.union(v.literal("pending"), v.literal("completed")),
    requestedAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_url", ["url"]),
});