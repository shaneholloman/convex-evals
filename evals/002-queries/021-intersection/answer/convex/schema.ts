import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    status: v.union(v.literal("active"), v.literal("inactive")),
  }).index("by_status", ["status"]),

  posts: defineTable({
    authorId: v.id("users"),
    title: v.string(),
    published: v.boolean(),
  }).index("by_published", ["authorId", "published"]),
});