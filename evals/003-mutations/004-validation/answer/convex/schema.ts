import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  events: defineTable({
    title: v.string(),
    description: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    capacity: v.number(),
    minAge: v.number(),
    status: v.union(v.literal("draft"), v.literal("published"), v.literal("cancelled")),
    organizerId: v.id("users"),
    categoryId: v.id("categories"),
    venue: v.object({
      name: v.string(),
      address: v.string(),
      capacity: v.number(),
      accessible: v.boolean(),
    }),
  })
    .index("by_organizer", ["organizerId", "startTime"])  // For finding organizer's events
    .index("by_category", ["categoryId"]),                // For category-based queries

  categories: defineTable({
    name: v.string(),
    minDuration: v.number(),
    maxDuration: v.number(),
    requiresModeration: v.boolean(),
  }),

  users: defineTable({
    name: v.string(),
    email: v.string(),
    birthDate: v.number(),
    role: v.union(v.literal("user"), v.literal("organizer"), v.literal("moderator")),
    verifiedOrganizer: v.boolean(),
  }).index("by_email", ["email"]),  // For email uniqueness and lookup
}); 