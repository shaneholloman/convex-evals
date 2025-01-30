import { query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

/**
 * Paginated query for posts that's compatible with usePaginatedQuery.
 * Returns posts in default order (ascending _creationTime) with proper cursor handling.
 */
export const paginatePosts = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  // Properly typed return validator matching usePaginatedQuery expectations
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id("posts"),
        _creationTime: v.number(),
        title: v.string(),
        content: v.string(),
      })
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())),
  }),
  handler: async (ctx, args) => {
    // Query posts with pagination
    const posts = await ctx.db
      .query("posts")
      .paginate(args.paginationOpts);

    return posts;
  },
});