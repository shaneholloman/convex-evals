import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  profiles: defineTable({
    username: v.string(),
    displayName: v.string(),
    bio: v.string(),
    version: v.number(),
    lastModified: v.number(),
    preferences: v.object({
      theme: v.union(v.literal("light"), v.literal("dark")),
      emailNotifications: v.boolean(),
      visibility: v.union(v.literal("public"), v.literal("private")),
    }),
  }).index("by_username", ["username"]),  // Index for username uniqueness checks
}); 