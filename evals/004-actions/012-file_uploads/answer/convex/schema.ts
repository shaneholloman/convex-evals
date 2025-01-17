import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  files: defineTable({
    filename: v.string(),
    mimeType: v.string(),
    size: v.number(),
    uploadedBy: v.string(),
    uploadedAt: v.number(),
    status: v.union(
      v.literal("uploading"),
      v.literal("validating"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    storageId: v.optional(v.string()),
    error: v.optional(v.string()),
    metadata: v.object({
      contentType: v.string(),
      lastModified: v.number(),
      checksum: v.string(),
    }),
  })
    .index("by_status", ["status"])
    .index("by_uploaded_by", ["uploadedBy"])
    .index("by_uploaded_at", ["uploadedAt"]),

  upload_chunks: defineTable({
    fileId: v.id("files"),
    chunkIndex: v.number(),
    size: v.number(),
    status: v.union(v.literal("pending"), v.literal("uploaded")),
    uploadedAt: v.optional(v.number()),
  })
    .index("by_file", ["fileId"])
    .index("by_file_chunk", ["fileId", "chunkIndex"])
    .index("by_file_status", ["fileId", "status"]),
}); 