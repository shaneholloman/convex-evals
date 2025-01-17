import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Valid ticket states
const ticketStates = [
  "new",
  "assigned",
  "in_progress",
  "blocked",
  "resolved",
  "closed",
] as const;

// Valid priorities
const priorities = ["low", "medium", "high", "urgent"] as const;

// Valid user roles
const userRoles = ["user", "agent", "admin"] as const;

export default defineSchema({
  tickets: defineTable({
    title: v.string(),
    description: v.string(),
    priority: v.union(...priorities.map((p) => v.literal(p))),
    status: v.union(...ticketStates.map((s) => v.literal(s))),
    assigneeId: v.optional(v.id("users")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    dueDate: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
  })
    .index("by_assignee", ["assigneeId"])
    .index("by_status", ["status"])
    .index("by_creator", ["createdBy"]),

  stateChanges: defineTable({
    ticketId: v.id("tickets"),
    fromState: v.union(...ticketStates.map((s) => v.literal(s))),
    toState: v.union(...ticketStates.map((s) => v.literal(s))),
    userId: v.id("users"),
    timestamp: v.number(),
    comment: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        reason: v.optional(v.string()),
        blockedBy: v.optional(v.string()),
        resolution: v.optional(v.string()),
      })
    ),
  })
    .index("by_ticket", ["ticketId", "timestamp"])
    .index("by_user", ["userId"]),

  users: defineTable({
    name: v.string(),
    role: v.union(...userRoles.map((r) => v.literal(r))),
    active: v.boolean(),
  }),
}); 