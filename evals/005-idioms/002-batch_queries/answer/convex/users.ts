import { internalQuery, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { userValidator } from "./schema";
import { Doc } from "./_generated/dataModel";

export const getUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserByEmailHelper(ctx, args);

    return user;
  },
});

export async function getUserByEmailHelper(ctx: QueryCtx, args: { email: string }): Promise<Doc<"users"> | null> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_email", q => q.eq("email", args.email))
    .unique();

  return user;
}