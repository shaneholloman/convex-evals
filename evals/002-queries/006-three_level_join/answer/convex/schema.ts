import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Organizations have many teams
  organizations: defineTable({
    name: v.string(),
  }),

  // Teams belong to organizations and have many members
  teams: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
  }).index("by_org", ["organizationId"]),

  // Team members belong to teams
  teamMembers: defineTable({
    teamId: v.id("teams"),
    userId: v.id("users"),
    role: v.union(v.literal("member"), v.literal("admin")),
  }).index("by_team_role", ["teamId", "role"]),

  users: defineTable({
    name: v.string(),
    profileUrl: v.string(),
  }),
}); 
