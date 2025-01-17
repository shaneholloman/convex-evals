import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

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

// Helper to simulate task processing
async function processTask(type: string, data: any): Promise<any> {
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  switch (type) {
    case "process_image":
      return {
        width: 800,
        height: 600,
        format: "jpeg",
        size: 12345,
      };
    case "generate_report":
      return {
        pages: 5,
        sections: ["summary", "details", "charts"],
        generated: new Date().toISOString(),
      };
    default:
      throw new Error(`Unsupported task type: ${type}`);
  }
}

export const tasks = httpAction(async (ctx, request) => {
  try {
    const url = new URL(request.url);
    const taskId = url.pathname.split("/")[2]; // /tasks/{taskId}
    
    if (request.method === "POST") {
      // Task submission
      const body = await request.json();
      const { type, priority, data } = body;
      
      // Create task
      const id = await ctx.runMutation(api.mutations.createTask, {
        type,
        priority,
        data,
      });
      
      // Get task details
      const task = await ctx.runQuery(api.queries.getTaskById, { taskId });
      
      if (!task) {
        throw new Error("Failed to create task");
      }
      
      // Estimate start time based on priority and current queue
      const higherPriorityTasks = await ctx.runQuery(api.queries.getHigherPriorityTasks, {
        priority,
        status: "pending",
      });
      
      const estimatedStart = Date.now() + higherPriorityTasks.length * 1000; // Rough estimate
      
      return new Response(
        JSON.stringify({
          taskId: task.id,
          status: task.status,
          estimatedStart,
        }),
        {
          status: 201,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    } else if (request.method === "GET" && taskId) {
      // Task status check
      const task = await ctx.runQuery(api.queries.getTaskById, { taskId });
      
      if (!task) {
        return new Response(
          JSON.stringify({ error: "Task not found" }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      }
      
      // Calculate progress for running tasks
      let progress = 0;
      let estimatedCompletion;
      
      if (task.status === "running" && task.startedAt) {
        const taskConfig = TASK_CONFIG.taskTypes[task.type as keyof typeof TASK_CONFIG.taskTypes];
        const elapsed = Date.now() - task.startedAt;
        const timeout = (taskConfig?.timeout ?? 300) * 1000;
        progress = Math.min(Math.floor((elapsed / timeout) * 100), 99);
        estimatedCompletion = task.startedAt + timeout;
      }
      
      return new Response(
        JSON.stringify({
          taskId: task.id,
          status: task.status,
          progress: task.status === "completed" ? 100 : progress,
          startedAt: task.startedAt,
          completedAt: task.completedAt,
          estimatedCompletion,
          result: task.result,
          error: task.error,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    } else if (request.method === "DELETE" && taskId) {
      // Task cancellation
      await ctx.runMutation(api.mutations.cancelTask, { taskId });
      
      return new Response(
        JSON.stringify({ message: "Task cancelled" }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }
    
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          "Allow": "GET, POST, DELETE",
        },
      }
    );
  } catch (error) {
    console.error("Task queue error:", error);
    
    return new Response(
      JSON.stringify({
        error: "Task queue error",
        message: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}); 