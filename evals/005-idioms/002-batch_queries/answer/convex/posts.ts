import { internalQuery, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { postValidator, userValidator } from "./schema";
import { Doc, Id } from "./_generated/dataModel";
import { getUserByEmailHelper } from "./users";

export const getPostsByUserId = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const posts = await getPostsByUserIdHelper(ctx, args);

    return posts;
  },
});

async function getPostsByUserIdHelper(ctx: QueryCtx, args: { userId: Id<"users"> }): Promise<Doc<"posts">[]> {
  const posts = await ctx.db
    .query("posts")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .collect();

  return posts;
}

export const getUserAndPosts = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    // Get the user first
    const user = await getUserByEmailHelper(ctx, args);

    // If no user found, return early with empty posts
    if (!user) {
      return { user: null, posts: [] };
    }

    // Get the user's posts
    const posts = await getPostsByUserIdHelper(ctx, { userId: user._id });

    return {
      user,
      posts,
    };
  },
});