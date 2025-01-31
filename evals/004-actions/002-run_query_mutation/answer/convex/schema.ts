import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  fetchRequests: defineTable({
    url: v.string(),
    data: v.any(),
  }).index("by_url", ["url"]),
});