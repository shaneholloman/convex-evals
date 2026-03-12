import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
  }).index("by_tokenIdentifier", ["tokenIdentifier"]),
  projects: defineTable({
    name: v.string(),
  }),
  projectMembers: defineTable({
    projectId: v.id("projects"),
    userId: v.id("users"),
  }).index("by_projectId_and_userId", ["projectId", "userId"]),
  tasks: defineTable({
    projectId: v.id("projects"),
    text: v.string(),
    completed: v.boolean(),
  }).index("by_projectId", ["projectId"]),
});
