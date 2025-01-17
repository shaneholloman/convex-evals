import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const insertMessages = mutation({
  handler: async (ctx) => {
    // Messages by Alice
    await ctx.db.insert("messages", {
      author: "alice",
      text: "Important announcement!",
      likes: 50,
      isPinned: true,
    });
    await ctx.db.insert("messages", {
      author: "alice",
      text: "Just a regular update",
      likes: 10,
      isPinned: false,
    });
    await ctx.db.insert("messages", {
      author: "alice",
      text: "Another pinned message",
      likes: 25,
      isPinned: true,
    });

    // Messages by Bob
    await ctx.db.insert("messages", {
      author: "bob",
      text: "Pinned with lots of likes",
      likes: 75,
      isPinned: true,
    });
    await ctx.db.insert("messages", {
      author: "bob",
      text: "Not very popular",
      likes: 5,
      isPinned: false,
    });
  },
});

export const getPopularPinnedMessages = query({
  args: { 
    author: v.string(),
    minLikes: v.number(),
  },
  handler: async (ctx, args) => {
    // First get all messages by the author using the index
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_author", (q) => q.eq("author", args.author))
      .collect();

    // Then filter and sort in JavaScript
    return messages
      .filter(msg => msg.isPinned && msg.likes >= args.minLikes)
      .sort((a, b) => b.likes - a.likes);
  },
});
