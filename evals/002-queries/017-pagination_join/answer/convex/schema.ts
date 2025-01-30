import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  messages: defineTable({
    authorId: v.id("users"),
    content: v.string(),
  }),

  users: defineTable({
    name: v.string(),
  }),
});