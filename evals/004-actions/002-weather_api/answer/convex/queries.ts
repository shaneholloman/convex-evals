import { query } from "./_generated/server";
import { v } from "convex/values";

export const getWeatherByLocation = query({
  args: {
    city: v.string(),
    country: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("weather")
      .withIndex("by_location", (q) =>
        q.eq("city", args.city).eq("country", args.country)
      )
      .order("desc")
      .first();
  },
}); 