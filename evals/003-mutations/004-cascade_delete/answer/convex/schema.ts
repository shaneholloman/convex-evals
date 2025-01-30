import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
  }).index("by_email", ["email"]),

  documents: defineTable({
    authorId: v.id("users"),
    title: v.string(),
    content: v.string(),
  }).index("by_author", ["authorId"]),
});