import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  messages: defineTable({
    content: v.string(),
    author_email: v.string(),
    sent_at: v.number(),
  }).index("by_author_and_time", ["author_email", "sent_at"]),
});