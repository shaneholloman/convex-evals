import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  tickets: defineTable({
    orgId: v.string(),
    title: v.string(),
    status: v.string(),
  }).index("by_orgId", ["orgId"]),
  ticketCounts: defineTable({
    orgId: v.string(),
    count: v.number(),
  }).index("by_orgId", ["orgId"]),
});
