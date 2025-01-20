import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sales: defineTable({
    region: v.string(),
    product: v.string(),
    category: v.string(),
    amount: v.number(),
    date: v.string(), // YYYY-MM format
  }).index("by_region_date", ["region", "date"]),
});
