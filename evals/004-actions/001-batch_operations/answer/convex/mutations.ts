import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const createUserWithRelated = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
  },
  handler: async (ctx, args): Promise<Id<"users">> => {
    // Check for existing user with same email
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", q => q.eq("email", args.email.toLowerCase()))
      .unique();

    if (existing) {
      throw new Error(`User with email ${args.email} already exists`);
    }

    // Create user
    const userId = await ctx.db.insert("users", {
      name: args.name,
      email: args.email.toLowerCase(),
      role: args.role,
      createdAt: Date.now(),
    });

    // Create profile
    await ctx.db.insert("profiles", {
      userId,
      displayName: args.name,
      avatarUrl: undefined,
      bio: undefined,
    });

    // Create settings
    await ctx.db.insert("settings", {
      userId,
      theme: "system",
      notifications: true,
      language: "en",
    });

    return userId;
  },
}); 