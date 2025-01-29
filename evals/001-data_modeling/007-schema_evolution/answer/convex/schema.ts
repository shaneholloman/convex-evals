import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  products: defineTable({
    name: v.string(),
    // Step 1: Add description as an optional field
    description: v.optional(v.string()),
    // Step 2: Make category optional before removal
    category: v.optional(v.string()),
    // Step 3: Support both boolean and string status
    // This allows existing code to continue working with booleans
    // while new code can use the enum values
    active: v.union(
      v.boolean(),
      v.union(v.literal("active"), v.literal("inactive"), v.literal("banned"))
    ),
  }),
});
