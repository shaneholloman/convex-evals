import { query } from "./_generated/server";
import { v } from "convex/values";

export const getFileStatus = query({
  args: {
    fileId: v.id("files"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.fileId);
  },
});

export const getUploadProgress = query({
  args: {
    fileId: v.id("files"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("upload_chunks")
      .withIndex("by_file", (q) => q.eq("fileId", args.fileId))
      .collect();
  },
}); 