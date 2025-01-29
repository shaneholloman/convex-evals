import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  configurations: defineTable({
    // Simple literal
    environment: v.literal("production"),

    // Union of string literals
    logLevel: v.union(
      v.literal("debug"),
      v.literal("info"),
      v.literal("warn"),
      v.literal("error")
    ),

    // Union of number literals
    priority: v.union(
      v.literal(1),
      v.literal(2),
      v.literal(3)
    ),

    // Union of number literal and boolean
    enabled: v.union(
      v.literal(0),
      v.literal(1),
      v.literal(false)
    ),

    // Union of different types
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal(0),
      v.literal(1),
      v.null()
    ),

    // Nested union structure
    feature: v.object({
      type: v.union(
        v.literal("basic"),
        v.literal("advanced")
      ),
      allowed: v.boolean()
    })
  })
});