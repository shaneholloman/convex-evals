import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const experimentLiteral = v.union(v.literal("no_guidelines"));

export default defineSchema({
  // Each record is a single eval run for a model (append-only for history)
  evalScores: defineTable({
    model: v.string(),
    scores: v.record(v.string(), v.number()),
    totalScore: v.number(),
    // Optional run identifier (e.g. git sha, date string)
    runId: v.optional(v.string()),
    // Optional experiment tag for A/B testing different configurations
    experiment: v.optional(experimentLiteral),
  })
    .index("by_model", ["model"])
    .index("by_experiment", ["experiment"]),

  authTokens: defineTable({
    name: v.string(),
    value: v.string(),
    createdAt: v.number(),
    lastUsed: v.optional(v.number()),
  })
    .index("by_value", ["value"])
    .index("by_name", ["name"]),
});
