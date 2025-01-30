import { query } from "./_generated/server";
import { v } from "convex/values";

export const getTeamsWithDeletedAdmins = query({
  args: {},
  returns: v.array(v.id("teams")),
  handler: async (ctx) => {
    const teamsWithDeletedAdmins = [];

    // Get all teams using async iteration
    for await (const team of ctx.db.query("teams")) {
      // Look up the admin user for this team
      const admin = await ctx.db.get(team.adminId);

      // If admin exists and is marked as deleted, add team to results
      if (admin?.deleted) {
        teamsWithDeletedAdmins.push(team._id);
      }
    }

    return teamsWithDeletedAdmins;
  },
});