import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  messages: defineTable({
    channelId: v.string(),
    content: v.string(),
    author: v.string(),
  }).index("by_channel", ["channelId"]),
  channels: defineTable({
    name: v.string(),
  }),
});