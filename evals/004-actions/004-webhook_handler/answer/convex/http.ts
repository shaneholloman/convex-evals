import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { ConvexError } from "convex/values";
import { Stripe } from "stripe";

// Initialize Stripe with webhook secret
const SUPPORTED_EVENTS = new Set([
  "payment_intent.succeeded",
  "payment_intent.failed",
  "customer.subscription.created",
  "customer.subscription.deleted",
]);

export const stripeWebhook = httpAction(async (ctx, request) => {
  try {
    // Verify request method
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Get Stripe signature
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return new Response("Missing Stripe signature", { status: 400 });
    }

    // Get webhook secret from environment
    const webhookSecret = ctx.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("Stripe webhook secret not configured");
    }

    // Parse and verify the event
    const payload = await request.text();
    let event: Stripe.Event;
    try {
      const stripe = new Stripe(ctx.env.STRIPE_SECRET_KEY ?? "", {
        apiVersion: "2023-10-16",
      });
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err) {
      return new Response(
        `Webhook signature verification failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        { status: 400 }
      );
    }

    // Check if we've already processed this event
    const existing = await ctx.runQuery(api.queries.getWebhookEventById, {
      stripeEventId: event.id,
    });
    if (existing) {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify event type is supported
    if (!SUPPORTED_EVENTS.has(event.type)) {
      await ctx.runMutation(api.mutations.storeWebhookEvent, {
        stripeEventId: event.id,
        eventType: event.type,
        timestamp: event.created,
        status: "failed",
        data: event,
        error: "Unsupported event type",
        processedAt: Date.now(),
      });
      return new Response("Unsupported event type", { status: 400 });
    }

    try {
      // Process payment events
      if (event.type.startsWith("payment_intent.")) {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await ctx.runMutation(api.mutations.storePayment, {
          stripePaymentId: paymentIntent.id,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          status: event.type === "payment_intent.succeeded" ? "succeeded" : "failed",
          customerId: paymentIntent.customer as string,
          metadata: paymentIntent.metadata,
          createdAt: event.created,
        });
      }

      // Store successful event
      await ctx.runMutation(api.mutations.storeWebhookEvent, {
        stripeEventId: event.id,
        eventType: event.type,
        timestamp: event.created,
        status: "processed",
        data: event,
        processedAt: Date.now(),
      });

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      // Store failed event
      await ctx.runMutation(api.mutations.storeWebhookEvent, {
        stripeEventId: event.id,
        eventType: event.type,
        timestamp: event.created,
        status: "failed",
        data: event,
        error: error instanceof Error ? error.message : "Unknown error",
        processedAt: Date.now(),
      });

      throw error;
    }
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: error instanceof ConvexError ? 400 : 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}); 