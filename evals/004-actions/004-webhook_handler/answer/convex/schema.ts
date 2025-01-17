import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  webhook_events: defineTable({
    stripeEventId: v.string(),
    eventType: v.string(),
    timestamp: v.number(),
    status: v.union(v.literal("processed"), v.literal("failed")),
    data: v.any(),
    error: v.optional(v.string()),
    processedAt: v.number(),
  }).index("by_stripe_event", ["stripeEventId"]),

  payments: defineTable({
    stripePaymentId: v.string(),
    amount: v.number(),
    currency: v.string(),
    status: v.union(v.literal("succeeded"), v.literal("failed")),
    customerId: v.string(),
    metadata: v.any(),
    createdAt: v.number(),
  }).index("by_stripe_payment", ["stripePaymentId"]),
}); 