import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { v4 as uuidv4 } from "uuid";

// Task configuration
const TASK_CONFIG = {
  maxConcurrent: 5,
  maxRetries: 3,
  retryDelays: [30, 300, 3600],
  taskTypes: {
    "process_image": {
      timeout: 300,
      maxRetries: 2,
    },
    "generate_report": {
      timeout: 1800,
      maxRetries: 1,
    },
  },
};

export const createTask = mutation({
  args: {
    type: v.string(),
    priority: v.number(),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    // Validate task type
    if (!TASK_CONFIG.taskTypes[args.type as keyof typeof TASK_CONFIG.taskTypes]) {
      throw new Error(`Invalid task type: ${args.type}`);
    }

    // Validate priority
    if (args.priority < 0 || args.priority > 9) {
      throw new Error("Priority must be between 0 and 9");
    }

    const taskId = `task_${uuidv4()}`;
    const now = Date.now();

    const id = await ctx.db.insert("tasks", {
      id: taskId,
      type: args.type,
      priority: args.priority,
      status: "pending",
      data: args.data,
      createdAt: now,
      attempts: 0,
    });

    // Update metrics
    await updateTaskMetrics(ctx, args.type);

    return id;
  },
});

export const updateTaskStatus = mutation({
  args: {
    taskId: v.string(),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db
      .query("tasks")
      .withIndex("by_id", (q) => q.eq("id", args.taskId))
      .first();

    if (!task) {
      throw new Error(`Task not found: ${args.taskId}`);
    }

    const now = Date.now();
    const updates: any = { status: args.status };

    if (args.status === "running") {
      updates.startedAt = now;
      updates.attempts = task.attempts + 1;
    } else if (args.status === "completed") {
      updates.completedAt = now;
      updates.result = args.result;
    } else if (args.status === "failed") {
      updates.completedAt = now;
      updates.error = args.error;

      // Schedule retry if available
      const taskConfig = TASK_CONFIG.taskTypes[task.type as keyof typeof TASK_CONFIG.taskTypes];
      const maxRetries = taskConfig?.maxRetries ?? TASK_CONFIG.maxRetries;

      if (task.attempts < maxRetries) {
        const retryDelay = TASK_CONFIG.retryDelays[task.attempts] ?? TASK_CONFIG.retryDelays[0];
        updates.status = "pending";
        updates.nextRetry = now + retryDelay * 1000;
      }
    }

    await ctx.db.patch(task._id, updates);

    // Update metrics
    await updateTaskMetrics(ctx, task.type);

    return task._id;
  },
});

export const cancelTask = mutation({
  args: {
    taskId: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db
      .query("tasks")
      .withIndex("by_id", (q) => q.eq("id", args.taskId))
      .first();

    if (!task) {
      throw new Error(`Task not found: ${args.taskId}`);
    }

    if (task.status === "completed" || task.status === "cancelled") {
      throw new Error(`Cannot cancel task in state: ${task.status}`);
    }

    await ctx.db.patch(task._id, {
      status: "cancelled",
      completedAt: Date.now(),
    });

    // Update metrics
    await updateTaskMetrics(ctx, task.type);

    return task._id;
  },
});

// Helper function to update task metrics
async function updateTaskMetrics(ctx: any, taskType: string) {
  const now = Date.now();
  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_type_status", (q) => q.eq("type", taskType))
    .collect();

  const metrics = {
    timestamp: now,
    taskType,
    totalTasks: tasks.length,
    completedTasks: tasks.filter((t: any) => t.status === "completed").length,
    failedTasks: tasks.filter((t: any) => t.status === "failed").length,
    maxConcurrent: tasks.filter((t: any) => t.status === "running").length,
    avgProcessingTime: calculateAvgProcessingTime(tasks),
  };

  await ctx.db.insert("task_metrics", metrics);
}

// Helper function to calculate average processing time
function calculateAvgProcessingTime(tasks: any[]): number {
  const completedTasks = tasks.filter(
    (t) => t.status === "completed" && t.startedAt && t.completedAt
  );

  if (completedTasks.length === 0) return 0;

  const totalTime = completedTasks.reduce(
    (sum, t) => sum + (t.completedAt - t.startedAt),
    0
  );

  return Math.floor(totalTime / completedTasks.length);
} 