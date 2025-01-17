import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Valid project statuses
const projectStatuses = [
  "active",
  "paused",
  "completed",
  "archived",
] as const;

// Valid task statuses
const taskStatuses = [
  "todo",
  "in_progress",
  "blocked",
  "completed",
] as const;

// Valid user roles
const userRoles = ["member", "manager", "admin"] as const;

export default defineSchema({
  projects: defineTable({
    name: v.string(),
    status: v.union(...projectStatuses.map((s) => v.literal(s))),
    ownerId: v.id("users"),
    budget: v.number(),
    startDate: v.number(),
    endDate: v.optional(v.number()),
    archived: v.boolean(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_status", ["status"]),

  tasks: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    status: v.union(...taskStatuses.map((s) => v.literal(s))),
    assigneeId: v.optional(v.id("users")),
    budget: v.number(),
    dueDate: v.optional(v.number()),
    archived: v.boolean(),
  })
    .index("by_project", ["projectId"])
    .index("by_assignee", ["assigneeId"])
    .index("by_status", ["status", "projectId"]),

  timeEntries: defineTable({
    taskId: v.id("tasks"),
    userId: v.id("users"),
    duration: v.number(),
    date: v.number(),
    billable: v.boolean(),
    rate: v.number(),
  })
    .index("by_task", ["taskId"])
    .index("by_user", ["userId"])
    .index("by_date", ["date"]),

  users: defineTable({
    name: v.string(),
    role: v.union(...userRoles.map((r) => v.literal(r))),
    defaultRate: v.number(),
    active: v.boolean(),
  }),
}); 