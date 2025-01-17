import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const insertTasks = mutation({
  handler: async (ctx) => {
    // Project: Website Redesign
    await ctx.db.insert("tasks", {
      projectId: "web_redesign",
      status: "todo",
      priority: 1,
      title: "Design new homepage",
      assignee: "alice",
    });
    await ctx.db.insert("tasks", {
      projectId: "web_redesign",
      status: "todo",
      priority: 2,
      title: "Create component library",
      assignee: "bob",
    });
    await ctx.db.insert("tasks", {
      projectId: "web_redesign",
      status: "in_progress",
      priority: 1,
      title: "Implement responsive layout",
      assignee: "carol",
    });

    // Project: Mobile App
    await ctx.db.insert("tasks", {
      projectId: "mobile_app",
      status: "done",
      priority: 1,
      title: "Design app icon",
      assignee: "alice",
    });
    await ctx.db.insert("tasks", {
      projectId: "mobile_app",
      status: "in_progress",
      priority: 1,
      title: "Implement authentication",
      assignee: "bob",
    });
    await ctx.db.insert("tasks", {
      projectId: "mobile_app",
      status: "todo",
      priority: 3,
      title: "Write app documentation",
      assignee: "carol",
    });
  },
});

export const getProjectTasksByStatus = query({
  args: {
    projectId: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_project_status_priority", (q) =>
        q.eq("projectId", args.projectId).eq("status", args.status)
      )
      .collect();
  },
});
