import { query } from "./_generated/server";
import { v } from "convex/values";

export const getWebhookEventById = query({
  args: {
    stripeEventId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("webhook_events")
      .withIndex("by_stripe_event", (q) =>
        q.eq("stripeEventId", args.stripeEventId)
      )
      .unique();
  },
}); 