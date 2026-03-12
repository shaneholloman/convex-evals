import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    email: v.string(),
    name: v.string(),
  }).index("by_tokenIdentifier", ["tokenIdentifier"]),
  exportRequests: defineTable({
    projectName: v.string(),
    requestedByUserId: v.id("users"),
    destinationEmail: v.string(),
    status: v.union(v.literal("queued"), v.literal("sent"), v.literal("failed")),
  }).index("by_requestedByUserId", ["requestedByUserId"]),
});
