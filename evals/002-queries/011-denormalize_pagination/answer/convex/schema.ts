import { v } from "convex/values";
import { defineSchema, defineTable } from "convex/server";

export default defineSchema({
  // Main owners table
  owners: defineTable({
    name: v.string(),
    age: v.number(),
  }),

  // Dogs table with denormalized owner name for efficient lookups
  dogs: defineTable({
    name: v.string(),
    breed: v.string(),
    ownerId: v.id("owners"),
    ownerAge: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_age", ["ownerAge"]),
});