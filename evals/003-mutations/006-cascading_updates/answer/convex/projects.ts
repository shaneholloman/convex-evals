import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// Maximum number of items to process in a batch
const BATCH_SIZE = 50;

// Archive error class
class ArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveError";
  }
}

export const archiveProject = mutation({
  args: {
    projectId: v.id("projects"),
    archiveReason: v.string(),
    preserveTimeEntries: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Get the project
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new ArchiveError("Project not found");
    }

    // Get the user (simulated auth context)
    const user = await ctx.db.get(ctx.auth.getUserIdentity()?.subject as Id<"users">);
    if (!user || !user.active) {
      throw new ArchiveError("User not found or inactive");
    }

    // Check permissions
    if (user.role !== "manager" && user.role !== "admin") {
      throw new ArchiveError("Only managers and admins can archive projects");
    }

    // Check if already archived
    if (project.archived) {
      throw new ArchiveError("Project is already archived");
    }

    // Get all tasks for the project
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // Check if all tasks are completed or archived
    const incompleteTasks = tasks.filter(
      (task) => !task.archived && task.status !== "completed"
    );
    if (incompleteTasks.length > 0) {
      throw new ArchiveError(
        `Cannot archive project with ${incompleteTasks.length} incomplete tasks`
      );
    }

    // Track changes for summary
    const changes = {
      tasks: [] as string[],
      timeEntries: [] as string[],
    };

    // Archive tasks in batches
    let archivedTasks = 0;
    for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
      const batch = tasks.slice(i, i + BATCH_SIZE);
      for (const task of batch) {
        await ctx.db.patch(task._id, {
          archived: true,
          status: "completed",
        });
        archivedTasks++;
      }
    }
    changes.tasks.push(`Archived ${archivedTasks} tasks`);

    // Handle time entries
    let archivedTimeEntries = 0;
    if (!args.preserveTimeEntries) {
      for (const task of tasks) {
        // Get time entries for this task
        const timeEntries = await ctx.db
          .query("timeEntries")
          .withIndex("by_task", (q) => q.eq("taskId", task._id))
          .collect();

        // Check for unbilled time
        const unbilledEntries = timeEntries.filter(
          (entry) => entry.billable && !entry.invoiced
        );
        if (unbilledEntries.length > 0) {
          throw new ArchiveError(
            `Cannot archive project with ${unbilledEntries.length} unbilled time entries`
          );
        }

        // Archive time entries in batches
        for (let i = 0; i < timeEntries.length; i += BATCH_SIZE) {
          const batch = timeEntries.slice(i, i + BATCH_SIZE);
          for (const entry of batch) {
            await ctx.db.delete(entry._id);
            archivedTimeEntries++;
          }
        }
      }
      changes.timeEntries.push(`Archived ${archivedTimeEntries} time entries`);
    } else {
      // Count preserved entries for reporting
      const preservedEntries = await ctx.db
        .query("timeEntries")
        .withIndex("by_task")
        .filter((q) =>
          q.eq(
            q.field("taskId"),
            tasks.map((t) => t._id)
          )
        )
        .collect();
      changes.timeEntries.push(
        `Preserved ${preservedEntries.length} time entries`
      );
    }

    // Update the project
    const updatedProject = await ctx.db.patch(args.projectId, {
      status: "archived",
      archived: true,
      endDate: project.endDate ?? Date.now(),
    });

    return {
      project: updatedProject,
      archivedTasks,
      archivedTimeEntries,
      changes,
    };
  },
}); 