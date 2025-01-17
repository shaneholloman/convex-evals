import { action, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

const MAX_BATCH_SIZE = 100;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const createUserWithRelated = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();

    if (existing) {
      throw new Error(`User with email ${args.email} already exists`);
    }

    const userId = await ctx.db.insert("users", {
      name: args.name,
      email: args.email.toLowerCase(),
      role: args.role,
      createdAt: Date.now(),
    });

    await ctx.db.insert("profiles", {
      userId,
      displayName: args.name,
      avatarUrl: undefined,
      bio: undefined,
    });

    await ctx.db.insert("settings", {
      userId,
      theme: "system",
      notifications: true,
      language: "en",
    });

    return userId;
  },
});

type BatchResult = {
  totalCreated: number;
  userIds: Id<"users">[];
  errors: { email: string; error: string }[];
};

export const batchCreate = action({
  args: {
    users: v.array(
      v.object({
        name: v.string(),
        email: v.string(),
        role: v.union(v.literal("admin"), v.literal("user")),
      })
    ),
  },
  handler: async (ctx, args): Promise<BatchResult> => {
    const result: BatchResult = {
      totalCreated: 0,
      userIds: [],
      errors: [],
    };

    if (args.users.length > MAX_BATCH_SIZE) {
      throw new Error(`Batch size cannot exceed ${MAX_BATCH_SIZE}`);
    }

    for (const user of args.users) {
      try {
        if (!EMAIL_REGEX.test(user.email)) {
          throw new Error("Invalid email format");
        }
        if (user.name.trim().length === 0) {
          throw new Error("Name cannot be empty");
        }

        const userId = await ctx.runMutation(createUserWithRelated, user);
        result.totalCreated++;
        result.userIds.push(userId);
      } catch (error) {
        result.errors.push({
          email: user.email,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return result;
  },
}); 