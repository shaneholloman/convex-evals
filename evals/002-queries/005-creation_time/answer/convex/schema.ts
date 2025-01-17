import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  comments: defineTable({
    postId: v.string(),
    author: v.string(),
    text: v.string(),
  }).index("by_post", ["postId"]),
}); 