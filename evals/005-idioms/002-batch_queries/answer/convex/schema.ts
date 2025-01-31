import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Export validators for reuse
export const userValidator = v.object({
  name: v.string(),
  email: v.string(),
});

export const postValidator = v.object({
  userId: v.id("users"),
  content: v.string(),
});

export default defineSchema({
  users: defineTable(userValidator)
    .index("by_email", ["email"]),
  
  posts: defineTable(postValidator)
    .index("by_user", ["userId"]),
});