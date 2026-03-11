import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  tasks: defineTable({
    title: v.string(),
    status: v.string(),
  }),
  checklistItems: defineTable({
    taskId: v.id("tasks"),
    text: v.string(),
    completed: v.boolean(),
  }).index("by_taskId", ["taskId"]),
});
