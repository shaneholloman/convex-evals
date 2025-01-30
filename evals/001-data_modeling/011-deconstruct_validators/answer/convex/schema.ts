import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Define the shared Result type validator
export const resultValidator = v.union(
  v.object({
    success: v.literal(true),
    value: v.string(),
  }),
  v.object({
    success: v.literal(false),
    error: v.string(),
  })
);

// Define the schema with two tables sharing the result type
export default defineSchema({
  llm_calls: defineTable({
    prompt: v.string(),
    result: resultValidator,
  }),

  api_calls: defineTable({
    url: v.string(),
    result: resultValidator,
  }),
});