import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
  }).index("by_email", ["email"]),

  userPresence: defineTable({
    userId: v.id("users"),
    lastHeartbeatMs: v.number(),
  }).index("by_userId", ["userId"]),
});
