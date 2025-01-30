import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  documents: defineTable({
    metadata: v.object({
      title: v.string(),
      author: v.object({
        name: v.string(),
        contact: v.object({
          email: v.string(),
          phone: v.optional(v.string()),
        }),
      }),
      tags: v.array(v.string()),
    }),
    content: v.string(),
  }),
});