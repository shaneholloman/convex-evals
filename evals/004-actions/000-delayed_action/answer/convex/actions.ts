import { action, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// Maximum delay allowed (60 seconds)
const MAX_DELAY_MS = 60 * 1000;

// Helper function to sleep for a given number of milliseconds
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Internal mutation to insert message
export const insertMessage = mutation({
  args: {
    message: v.string(),
    delayMs: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      message: args.message,
      delayMs: args.delayMs,
      createdAt: Date.now(),
    });
  },
});

export const delayedInsert = action({
  args: {
    message: v.string(),
    delayMs: v.number(),
  },
  handler: async (ctx, args): Promise<Id<"messages">> => {
    // Validate arguments
    if (args.message.trim().length === 0) {
      throw new Error("Message cannot be empty");
    }
    if (args.delayMs < 0) {
      throw new Error("Delay cannot be negative");
    }
    if (args.delayMs > MAX_DELAY_MS) {
      throw new Error(`Delay cannot exceed ${MAX_DELAY_MS}ms`);
    }

    // Sleep for the specified delay
    await sleep(args.delayMs);

    // Insert the message after delay
    return await ctx.runMutation(insertMessage, {
      message: args.message,
      delayMs: args.delayMs,
    });
  },
}); 