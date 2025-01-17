import { query } from "./_generated/server";
import { v } from "convex/values";

export const getFileById = query({
  args: {
    fileId: v.id("files"),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) {
      return null;
    }
    return {
      id: args.fileId,
      ...file,
    };
  },
}); 