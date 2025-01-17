import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const insertNote = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    // Validate title length
    if (args.title.length < 1 || args.title.length > 100) {
      throw new Error("Title must be between 1-100 characters");
    }

    // Validate content length
    if (args.content.length < 1 || args.content.length > 1000) {
      throw new Error("Content must be between 1-1000 characters");
    }

    // Validate tags if provided
    if (args.tags) {
      for (const tag of args.tags) {
        if (tag.length < 1 || tag.length > 20) {
          throw new Error("Each tag must be between 1-20 characters");
        }
      }
    }

    // Insert the note with current timestamp
    const note = await ctx.db.insert("notes", {
      title: args.title,
      content: args.content,
      createdAt: Date.now(),
      ...(args.tags && { tags: args.tags }),
    });

    return note;
  },
}); 