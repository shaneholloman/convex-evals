import { v } from "convex/values";
import { query } from "./_generated/server";

export const getPostComments = query({
  args: { postId: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("comments"),
      _creationTime: v.number(),
      postId: v.string(),
      author: v.string(),
      text: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("comments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .order("desc")
      .collect();
  },
});
