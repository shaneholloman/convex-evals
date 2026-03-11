import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  activityLog: defineTable({
    workspaceId: v.string(),
    action: v.string(),
  }).index("by_workspaceId", ["workspaceId"]),
});
