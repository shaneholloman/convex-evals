import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Users and their preferences
  users: defineTable({
    name: v.string(),
    email: v.string(),
  }).index("by_email", ["email"]),
  userPreferences: defineTable({
    userId: v.id("users"),
    theme: v.string(),
    notifications: v.boolean(),
  }).index("by_user", ["userId"]),

  // Posts and their reactions
  posts: defineTable({
    authorId: v.id("users"),
    title: v.string(),
    content: v.string(),
  }).index("by_author", ["authorId"]),
  reactions: defineTable({
    postId: v.id("posts"),
    userId: v.id("users"),
    type: v.union(
      v.literal("like"),
      v.literal("heart"),
      v.literal("celebrate"),
    ),
  }).index("by_post", ["postId"]),
});
