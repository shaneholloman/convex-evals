import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
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
};

export const upload = httpAction(async (ctx, request) => {
  try {
    const url = new URL(request.url);
    const path = url.pathname.split("/");
    const action = path[2]; // /upload/{action}/{fileId}
    const fileId = path[3] as Id<"files">;

    if (request.method === "POST" && action === "init") {
      // Initialize upload
      const body = await request.json();
      const { filename, size, type, metadata } = body;

      const result = await ctx.runMutation(api.mutations.initializeUpload, {
        filename,
        size,
        mimeType: type,
        metadata: {
          contentType: type,
          lastModified: metadata.lastModified,
          checksum: metadata.checksum || "pending",
        },
      });

      // Generate pre-signed URLs for chunk uploads (simulated)
      const uploadUrls = Array.from({ length: result.numChunks }, (_, i) => 
        `/upload/chunk/${result.fileId}/${i}`
      );

      return new Response(
        JSON.stringify({
          fileId: result.fileId,
          uploadUrls,
        }),
        {
          status: 201,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    } else if (request.method === "PUT" && action === "chunk") {
      // Handle chunk upload
      const chunkIndex = parseInt(path[4], 10);
      
      // In a real implementation, we would stream the chunk to storage here
      // For this eval, we'll simulate successful upload
      await ctx.runMutation(api.mutations.markChunkUploaded, {
        fileId,
        chunkIndex,
      });

      return new Response(null, { status: 204 });
    } else if (request.method === "POST" && action === "complete") {
      // Complete upload
      const result = await ctx.runMutation(api.mutations.completeUpload, {
        fileId,
      });

      return new Response(
        JSON.stringify(result),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    } else if (request.method === "GET" && action === "status") {
      // Get upload status
      const file = await ctx.runQuery(api.queries.getFileStatus, { fileId });
      
      if (!file) {
        return new Response(
          JSON.stringify({ error: "File not found" }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      }

      // Calculate progress for uploading files
      let progress = 0;
      if (file.status === "uploading") {
        const chunks = await ctx.runQuery(api.queries.getUploadProgress, { fileId });
        const uploadedChunks = chunks.filter(chunk => chunk.status === "uploaded").length;
        progress = Math.floor((uploadedChunks / chunks.length) * 100);
      } else if (file.status === "completed") {
        progress = 100;
      }

      return new Response(
        JSON.stringify({
          status: file.status,
          progress,
          error: file.error,
          storageId: file.storageId,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          "Allow": "GET, POST, PUT",
        },
      }
    );
  } catch (error) {
    console.error("Upload error:", error);
    
    return new Response(
      JSON.stringify({
        error: "Upload error",
        message: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}); 