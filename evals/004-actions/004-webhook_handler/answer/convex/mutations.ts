import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const storeWebhookEvent = mutation({
  args: {
    stripeEventId: v.string(),
    eventType: v.string(),
    timestamp: v.number(),
    status: v.union(v.literal("processed"), v.literal("failed")),
    data: v.any(),
    error: v.optional(v.string()),
    processedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("webhook_events", args);
  },
});

export const storePayment = mutation({
  args: {
    stripePaymentId: v.string(),
    amount: v.number(),
    currency: v.string(),
    status: v.union(v.literal("succeeded"), v.literal("failed")),
    customerId: v.string(),
    metadata: v.any(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("payments", args);
  },
}); 