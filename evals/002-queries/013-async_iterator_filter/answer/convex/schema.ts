import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  teams: defineTable({
    name: v.string(),
    adminId: v.id("users"),
  }),

  users: defineTable({
    name: v.string(),
    deleted: v.boolean(),
  }),
});