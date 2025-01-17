import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const toggleTask = mutation({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    // Get the existing task
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Task not found");
    }

    const now = Date.now();
    const newCompleted = !task.completed;

    // Update the task with new state
    const updatedTask = await ctx.db.patch(args.taskId, {
      completed: newCompleted,
      updatedAt: now,
      ...(newCompleted
        ? { completedAt: now }  // Add completedAt if now complete
        : { completedAt: undefined }),  // Remove completedAt if now incomplete
    });

    return updatedTask;
  },
}); 