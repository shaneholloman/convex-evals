import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const updateDocumentStatus = mutation({
  args: {
    documentId: v.id("documents"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    lastOperation: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) {
      throw new Error(`Document ${args.documentId} not found`);
    }

    return await ctx.db.patch(args.documentId, {
      status: args.status,
      lastOperation: args.lastOperation,
      operationCount: (doc.operationCount ?? 0) + 1,
    });
  },
});

export const storeOperationResult = mutation({
  args: {
    documentId: v.id("documents"),
    operation: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    success: v.boolean(),
    result: v.any(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("operation_results", args);
  },
}); 