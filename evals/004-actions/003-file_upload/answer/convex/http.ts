import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { ConvexError } from "convex/values";

// Maximum file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed file types
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export const upload = httpAction(async (ctx, request) => {
  try {
    // Verify request method
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Verify content type
    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("multipart/form-data")) {
      return new Response("Invalid content type", { status: 400 });
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return new Response("Missing file", { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return new Response("File too large", { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return new Response("Invalid file type", { status: 400 });
    }

    // Get metadata
    const description = formData.get("description")?.toString() || undefined;
    const tagsStr = formData.get("tags")?.toString() || "";
    const tags = tagsStr ? tagsStr.split(",").map(t => t.trim()).filter(Boolean) : [];

    // Store file in Convex storage
    const storageId = await ctx.storage.store(file);

    // Create file record
    const fileId = await ctx.runMutation(api.mutations.insertFile, {
      storageId,
      filename: file.name,
      size: file.size,
      mimeType: file.type,
      description,
      tags,
      uploadedAt: Date.now(),
    });

    // Get file details
    const fileDetails = await ctx.runQuery(api.queries.getFileById, { fileId });

    return new Response(
      JSON.stringify({
        success: true,
        file: fileDetails,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Upload error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: error instanceof ConvexError ? 400 : 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}); 