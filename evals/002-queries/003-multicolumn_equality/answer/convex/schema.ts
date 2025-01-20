import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  tasks: defineTable({
    projectId: v.string(),
    status: v.string(),
    priority: v.number(),
    title: v.string(),
    assignee: v.string(),
  }).index("by_project_status_priority", ["projectId", "status", "priority"]),
});
