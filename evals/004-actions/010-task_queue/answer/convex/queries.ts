import { query } from "./_generated/server";
import { v } from "convex/values";

export const getTaskById = query({
  args: {
    taskId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_id", (q) => q.eq("id", args.taskId))
      .first();
  },
});

export const getHigherPriorityTasks = query({
  args: {
    priority: v.number(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_priority_status", (q) =>
        q.gt("priority", args.priority).eq("status", args.status)
      )
      .collect();
  },
}); 