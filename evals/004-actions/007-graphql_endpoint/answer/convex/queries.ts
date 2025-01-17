import { query } from "./_generated/server";
import { v } from "convex/values";

export const getAuthorById = query({
  args: { id: v.id("authors") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getBookById = query({
  args: { id: v.id("books") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getBooksByAuthor = query({
  args: { authorId: v.id("authors") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("books")
      .withIndex("by_author", (q) => q.eq("authorId", args.authorId))
      .collect();
  },
});

export const getBooksByGenre = query({
  args: { genre: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("books")
      .withIndex("by_genre", (q) => q.eq("genre", args.genre))
      .collect();
  },
});

export const getReviewsByBook = query({
  args: { bookId: v.id("books") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reviews")
      .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
      .collect();
  },
});

export const getReviewsByUser = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reviews")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
}); 