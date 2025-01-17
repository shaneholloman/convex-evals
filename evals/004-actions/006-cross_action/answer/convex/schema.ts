import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  documents: defineTable({
    title: v.string(),
    content: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    lastOperation: v.optional(v.string()),
    operationCount: v.number(),
    metadata: v.any(),
  }),

  operation_results: defineTable({
    documentId: v.id("documents"),
    operation: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    success: v.boolean(),
    result: v.any(),
    error: v.optional(v.string()),
  })
    .index("by_document", ["documentId"])
    .index("by_document_operation", ["documentId", "operation"]),
}); 