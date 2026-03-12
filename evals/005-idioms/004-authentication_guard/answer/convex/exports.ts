import { mutation, MutationCtx } from "./_generated/server";
import { v } from "convex/values";

async function getAuthenticatedUserId(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
  if (!user) {
    throw new Error("User not found");
  }
  return user._id;
}

export const requestExport = mutation({
  args: {
    projectName: v.string(),
    destinationEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    return await ctx.db.insert("exportRequests", {
      projectName: args.projectName,
      requestedByUserId: userId,
      destinationEmail: args.destinationEmail,
      status: "queued",
    });
  },
});
