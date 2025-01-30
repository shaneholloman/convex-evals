import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Main owners table
  owners: defineTable({
    name: v.string(),
    age: v.number(),
  }),

  // Dogs table with denormalized owner age for efficient sorting
  dogs: defineTable({
    name: v.string(),
    breed: v.string(),
    ownerId: v.id("owners"),
    ownerAge: v.number(), // denormalized field for sorting
  })
    .index("by_owner_age", ["ownerAge"]) // For efficient age-based sorting
    .index("by_owner", ["ownerId"]), // For efficient updates when owner changes
});