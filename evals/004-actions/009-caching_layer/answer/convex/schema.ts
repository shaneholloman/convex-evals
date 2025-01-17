import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  cache_entries: defineTable({
    key: v.string(),
    value: v.any(),
    createdAt: v.number(),
    expiresAt: v.number(),
    lastAccessed: v.number(),
    accessCount: v.number(),
    size: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_expiry", ["expiresAt"])
    .index("by_last_accessed", ["lastAccessed"]),

  cache_metrics: defineTable({
    timestamp: v.number(),
    hits: v.number(),
    misses: v.number(),
    evictions: v.number(),
    totalSize: v.number(),
    avgLatency: v.number(),
  }).index("by_timestamp", ["timestamp"]),
}); 