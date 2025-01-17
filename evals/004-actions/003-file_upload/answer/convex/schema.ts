import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  files: defineTable({
    storageId: v.string(),
    filename: v.string(),
    size: v.number(),
    mimeType: v.string(),
    description: v.optional(v.string()),
    tags: v.array(v.string()),
    uploadedAt: v.number(),
  }).index("by_storage_id", ["storageId"]),
}); 