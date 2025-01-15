import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email_addresses: v.array(v.string()),
  }),
  posts: defineTable({
    title: v.string(),
    author: v.id("users"),
    content: v.string(),
  }),  
});