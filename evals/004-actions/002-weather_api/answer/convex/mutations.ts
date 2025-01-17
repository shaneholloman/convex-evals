import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const insertWeather = mutation({
  args: {
    city: v.string(),
    country: v.string(),
    timestamp: v.number(),
    temperature: v.number(),
    humidity: v.number(),
    conditions: v.string(),
    windSpeed: v.number(),
    lastUpdated: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("weather", args);
  },
}); 