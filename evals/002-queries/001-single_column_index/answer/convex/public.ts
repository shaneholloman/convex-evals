import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const insertUsers = mutation({
  handler: async (ctx) => {
    await ctx.db.insert("users", {
      email: "alice@example.com",
      name: "Alice Smith",
      age: 28,
    });
    await ctx.db.insert("users", {
      email: "bob@example.com",
      name: "Bob Jones",
      age: 35,
    });
    await ctx.db.insert("users", {
      email: "carol@example.com",
      name: "Carol Wilson",
      age: 42,
    });
  },
});

export const getUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
  },
});
