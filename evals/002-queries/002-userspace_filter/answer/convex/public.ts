import { v } from "convex/values"
import { query } from "./_generated/server"

export const getPopularPinnedMessages = query({
  args: { 
    author: v.string(),
    minLikes: v.number(),
  },  
  returns: v.array(v.object({
    _id: v.id("messages"),
    _creationTime: v.number(),
    author: v.string(),
    text: v.string(),
    likes: v.number(),
    isPinned: v.boolean(),
  })),
  handler: async (ctx, args) => {  
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_author", (q) => q.eq("author", args.author))
      .collect();    
    return messages
      .filter(msg => msg.isPinned && msg.likes >= args.minLikes)
      .sort((a, b) => b.likes - a.likes);
  },
});
