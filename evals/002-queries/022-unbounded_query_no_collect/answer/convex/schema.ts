import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  auditLogs: defineTable({
    workspaceId: v.string(),
    actor: v.string(),
    action: v.string(),
  }).index("by_workspaceId", ["workspaceId"]),
});
