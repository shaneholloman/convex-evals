import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const insertComments = mutation({
  handler: async (ctx) => {
    // First post comments in chronological order
    await ctx.db.insert("comments", {
      postId: "post1",
      author: "alice",
      text: "First comment on the post!",
    });
    await ctx.db.insert("comments", {
      postId: "post1",
      author: "bob",
      text: "Great point, Alice.",
    });
    await ctx.db.insert("comments", {
      postId: "post1",
      author: "carol",
      text: "I agree with both of you.",
    });

    // Second post comments
    await ctx.db.insert("comments", {
      postId: "post2",
      author: "bob",
      text: "Starting a new discussion.",
    });
    await ctx.db.insert("comments", {
      postId: "post2",
      author: "alice",
      text: "Interesting perspective, Bob.",
    });
  },
});

export const getPostComments = query({
  args: { postId: v.string() },
  handler: async (ctx, args) => {
    // No need for explicit ordering - will be ordered by _creationTime ascending
    return await ctx.db
      .query("comments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();
  },
});
