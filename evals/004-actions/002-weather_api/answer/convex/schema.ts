import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  weather: defineTable({
    city: v.string(),
    country: v.string(),
    timestamp: v.number(),
    temperature: v.number(),
    humidity: v.number(),
    conditions: v.string(),
    windSpeed: v.number(),
    lastUpdated: v.number(),
  }).index("by_location", ["city", "country"]),
}); 