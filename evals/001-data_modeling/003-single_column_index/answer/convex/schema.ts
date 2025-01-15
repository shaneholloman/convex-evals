import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  messages: defineTable({
    content: v.string(),
    author_email: v.string(),
  }).index("by_author", ["author_email"]),
});