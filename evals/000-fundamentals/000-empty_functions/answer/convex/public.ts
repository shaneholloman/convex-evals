import { query, mutation, action, internalQuery, internalMutation, internalAction } from "./_generated/server";
import { v } from "convex/values";

// Public functions
export const emptyPublicQuery = query({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    return null;
  },
});

export const emptyPublicMutation = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    return null;
  },
});

export const emptyPublicAction = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    return null;
  },
});

// Private functions
export const emptyPrivateQuery = internalQuery({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    return null;
  },
});

export const emptyPrivateMutation = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    return null;
  },
});

export const emptyPrivateAction = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    return null;
  },
});