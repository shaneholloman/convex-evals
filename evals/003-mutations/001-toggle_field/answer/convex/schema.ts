import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  tasks: defineTable({
    title: v.string(),
    completed: v.boolean(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  }),
}); 