import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  profiles: defineTable({
    userId: v.id("users"),
    displayName: v.string(),
    avatarUrl: v.optional(v.string()),
    bio: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  settings: defineTable({
    userId: v.id("users"),
    theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
    notifications: v.boolean(),
    language: v.string(),
  }).index("by_user", ["userId"]),
}); 