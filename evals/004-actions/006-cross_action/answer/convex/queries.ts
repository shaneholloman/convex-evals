import { query } from "./_generated/server";
import { v } from "convex/values";

export const getDocument = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.documentId);
  },
}); 