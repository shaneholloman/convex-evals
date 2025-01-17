import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const insertFile = mutation({
  args: {
    storageId: v.string(),
    filename: v.string(),
    size: v.number(),
    mimeType: v.string(),
    description: v.optional(v.string()),
    tags: v.array(v.string()),
    uploadedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("files", args);
  },
}); 