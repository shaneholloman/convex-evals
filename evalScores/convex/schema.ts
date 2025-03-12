import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  evalScores: defineTable({
    model: v.string(),
    scores: v.record(v.string(), v.number()),
  }).index("by_model", ["model"]),
});