import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// Upload configuration
const UPLOAD_CONFIG = {
  maxFileSize: 100 * 1024 * 1024, // 100MB
  chunkSize: 5 * 1024 * 1024, // 5MB chunks
  allowedTypes: [
    "image/jpeg",
    "image/png",
    "image/gif",
    "application/pdf",
    "text/plain",
  ],
  validationTimeoutMs: 30000, // 30 seconds
  processingTimeoutMs: 60000, // 60 seconds
  maxConcurrentUploads: 3,
};

export const initializeUpload = mutation({
  args: {
    filename: v.string(),
    size: v.number(),
    mimeType: v.string(),
    metadata: v.object({
      contentType: v.string(),
      lastModified: v.number(),
      checksum: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    // Validate file size
    if (args.size > UPLOAD_CONFIG.maxFileSize) {
      throw new Error(`File size exceeds maximum allowed size of ${UPLOAD_CONFIG.maxFileSize} bytes`);
    }

    // Validate file type
    if (!UPLOAD_CONFIG.allowedTypes.includes(args.mimeType)) {
      throw new Error(`File type ${args.mimeType} is not allowed`);
    }

    // Check concurrent upload limit
    const activeUploads = await ctx.db
      .query("files")
      .withIndex("by_status", (q) => q.eq("status", "uploading"))
      .collect();

    if (activeUploads.length >= UPLOAD_CONFIG.maxConcurrentUploads) {
      throw new Error("Maximum concurrent upload limit reached");
    }

    // Create file record
    const fileId = await ctx.db.insert("files", {
      ...args,
      uploadedBy: "user", // In a real app, this would come from auth
      uploadedAt: Date.now(),
      status: "uploading",
    });

    // Calculate number of chunks needed
    const numChunks = Math.ceil(args.size / UPLOAD_CONFIG.chunkSize);

    // Create chunk records
    for (let i = 0; i < numChunks; i++) {
      const chunkSize = i === numChunks - 1 
        ? args.size % UPLOAD_CONFIG.chunkSize || UPLOAD_CONFIG.chunkSize
        : UPLOAD_CONFIG.chunkSize;

      await ctx.db.insert("upload_chunks", {
        fileId,
        chunkIndex: i,
        size: chunkSize,
        status: "pending",
      });
    }

    return { fileId, numChunks };
  },
});

export const markChunkUploaded = mutation({
  args: {
    fileId: v.id("files"),
    chunkIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const chunk = await ctx.db
      .query("upload_chunks")
      .withIndex("by_file_chunk", (q) => 
        q.eq("fileId", args.fileId).eq("chunkIndex", args.chunkIndex)
      )
      .first();

    if (!chunk) {
      throw new Error("Chunk not found");
    }

    await ctx.db.patch(chunk._id, {
      status: "uploaded",
      uploadedAt: Date.now(),
    });

    // Check if all chunks are uploaded
    const pendingChunks = await ctx.db
      .query("upload_chunks")
      .withIndex("by_file_status", (q) => 
        q.eq("fileId", args.fileId).eq("status", "pending")
      )
      .collect();

    if (pendingChunks.length === 0) {
      // All chunks uploaded, move to validation
      await ctx.db.patch(args.fileId, {
        status: "validating",
      });
    }
  },
});

export const completeUpload = mutation({
  args: {
    fileId: v.id("files"),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new Error("File not found");
    }

    if (file.status !== "validating") {
      throw new Error("File is not ready for completion");
    }

    // Simulate validation and processing
    const success = Math.random() > 0.1; // 90% success rate

    if (success) {
      await ctx.db.patch(args.fileId, {
        status: "completed",
        storageId: `storage_${Date.now()}`, // In a real app, this would be a real storage ID
      });
    } else {
      await ctx.db.patch(args.fileId, {
        status: "failed",
        error: "Validation failed: file appears to be corrupted",
      });
    }

    return { success };
  },
}); 