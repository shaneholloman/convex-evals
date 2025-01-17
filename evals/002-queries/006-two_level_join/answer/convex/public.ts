import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { Id } from "./_generated/dataModel"

export const insertOrgData = mutation({
  handler: async (ctx) => {
    // Create organizations
    const freeOrgId = await ctx.db.insert("organizations", {
      name: "Startup Inc",
      plan: "free",
    })
    const proOrgId = await ctx.db.insert("organizations", {
      name: "Enterprise Corp",
      plan: "pro",
    })

    // Create teams for free org
    const freeTeam1Id = await ctx.db.insert("teams", {
      organizationId: freeOrgId,
      name: "Engineering",
    })
    const freeTeam2Id = await ctx.db.insert("teams", {
      organizationId: freeOrgId,
      name: "Design",
    })

    // Create teams for pro org
    const proTeam1Id = await ctx.db.insert("teams", {
      organizationId: proOrgId,
      name: "Product",
    })
    const proTeam2Id = await ctx.db.insert("teams", {
      organizationId: proOrgId,
      name: "Marketing",
    })

    // Add members to free org teams
    await ctx.db.insert("teamMembers", {
      teamId: freeTeam1Id,
      userId: "alice",
      role: "admin",
    })
    await ctx.db.insert("teamMembers", {
      teamId: freeTeam1Id,
      userId: "bob",
      role: "member",
    })
    await ctx.db.insert("teamMembers", {
      teamId: freeTeam2Id,
      userId: "carol",
      role: "admin",
    })
    await ctx.db.insert("teamMembers", {
      teamId: freeTeam2Id,
      userId: "dave",
      role: "member",
    })

    // Add members to pro org teams
    await ctx.db.insert("teamMembers", {
      teamId: proTeam1Id,
      userId: "eve",
      role: "admin",
    })
    await ctx.db.insert("teamMembers", {
      teamId: proTeam1Id,
      userId: "frank",
      role: "member",
    })
    await ctx.db.insert("teamMembers", {
      teamId: proTeam2Id,
      userId: "grace",
      role: "admin",
    })
    await ctx.db.insert("teamMembers", {
      teamId: proTeam2Id,
      userId: "henry",
      role: "member",
    })
  },
})

export const getOrgMembersByRole = query({
  args: {
    organizationId: v.id("organizations"),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    // First get all teams in the organization
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect()

    // For each team, get its members with the specified role
    const teamMembersPromises = teams.map(async (team) => {
      const members = await ctx.db
        .query("teamMembers")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .filter((q) => q.eq(q.field("role"), args.role))
        .collect()

      // Return members with team details included
      return members.map((member) => ({
        ...member,
        teamName: team.name,
      }))
    })

    // Wait for all member queries and flatten the results
    const allMembers = await Promise.all(teamMembersPromises)
    return allMembers.flat()
  },
})
