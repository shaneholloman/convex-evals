import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Organizations have many teams
  organizations: defineTable({
    name: v.string(),
    plan: v.string(), // "free" or "pro"
  }),

  // Teams belong to organizations and have many members
  teams: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
  }).index("by_org", ["organizationId"]),

  // Team members belong to teams
  teamMembers: defineTable({
    teamId: v.id("teams"),
    userId: v.string(),
    role: v.string(), // "member" or "admin"
  }).index("by_team", ["teamId"]),
}); 