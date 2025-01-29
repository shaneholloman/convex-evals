import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Demonstrate three different patterns for optional/nullable fields
  optionals: defineTable({
    // Pattern 1: nullable
    // Field must be present but can be null or string
    // Cannot be omitted when inserting/updating
    nullable: v.union(v.null(), v.string()),

    // Pattern 2: maybe_nullable
    // Field can be:
    // - Completely absent (undefined)
    // - Present but null
    // - Present with string value
    maybe_nullable: v.optional(v.union(v.null(), v.string())),

    // Pattern 3: maybe
    // Field can be:
    // - Completely absent (undefined)
    // - Present with string value
    // Cannot be explicitly null
    maybe: v.optional(v.string()),
  }),
});