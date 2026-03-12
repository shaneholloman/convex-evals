import { v } from "convex/values";
import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

async function getAuthenticatedUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
  if (!user) throw new Error("User not found");
  return user;
}

async function assertProjectMember(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  userId: Id<"users">,
) {
  const membership = await ctx.db
    .query("projectMembers")
    .withIndex("by_projectId_and_userId", (q) =>
      q.eq("projectId", projectId).eq("userId", userId),
    )
    .unique();
  if (!membership) throw new Error("Not a member of this project");
}

export const listTasks = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    await assertProjectMember(ctx, args.projectId, user._id);

    return await ctx.db
      .query("tasks")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const createTask = mutation({
  args: {
    projectId: v.id("projects"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    await assertProjectMember(ctx, args.projectId, user._id);

    return await ctx.db.insert("tasks", {
      projectId: args.projectId,
      text: args.text,
      completed: false,
    });
  },
});
