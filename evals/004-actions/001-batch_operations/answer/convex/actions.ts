import { action } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";

const MAX_BATCH_SIZE = 100;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

        const userId = await ctx.runMutation(api.mutations.createUserWithRelated, user);
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