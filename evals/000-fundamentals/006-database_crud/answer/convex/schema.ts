import { v } from "convex/values";
import { defineSchema, defineTable } from "convex/server";

export default defineSchema({
  locations: defineTable({
    name: v.string(),
    latitude: v.number(),
    longitude: v.number(),
  }),
});
