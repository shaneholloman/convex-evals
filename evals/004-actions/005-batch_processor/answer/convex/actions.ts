import { action } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { v4 as uuidv4 } from "uuid";

// Maximum batch size
const MAX_BATCH_SIZE = 100;

// Sleep function for simulating processing time
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

type ProcessingResult = {
  jobId: string;
  totalProcessed: number;
  successful: number;
  failed: number;
  timeElapsed: number;
  errors: Array<{
    userId: Id<"users">;
    error: string;
  }>;
};

export const processUsers = action({
  args: {
    userIds: v.array(v.id("users")),
    batchSize: v.number(),
  },
  handler: async (ctx, args): Promise<ProcessingResult> => {
    // Validate batch size
    const batchSize = Math.min(args.batchSize, MAX_BATCH_SIZE);
    if (batchSize <= 0) {
      throw new Error("Batch size must be positive");
    }

    // Create job record
    const jobId = uuidv4();
    await ctx.runMutation(api.mutations.createJob, {
      jobId,
      type: "user_processing",
      totalItems: args.userIds.length,
    });

    const startTime = Date.now();
    const result: ProcessingResult = {
      jobId,
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      timeElapsed: 0,
      errors: [],
    };

    // Process users in batches
    for (let i = 0; i < args.userIds.length; i += batchSize) {
      const batch = args.userIds.slice(i, i + batchSize);
      
      // Process each user in the batch
      for (const userId of batch) {
        try {
          // Simulate processing time (100-300ms per user)
          await sleep(100 + Math.random() * 200);

          // Update user status
          await ctx.runMutation(api.mutations.updateUserStatus, {
            userId,
            status: "processed",
          });

          // Create audit log
          await ctx.runMutation(api.mutations.createAuditLog, {
            userId,
            action: "process_user",
            details: { jobId },
            status: "success",
          });

          result.successful++;
        } catch (error) {
          // Handle user processing error
          await ctx.runMutation(api.mutations.updateUserStatus, {
            userId,
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
          });

          await ctx.runMutation(api.mutations.createAuditLog, {
            userId,
            action: "process_user",
            details: { jobId, error: error instanceof Error ? error.message : "Unknown error" },
            status: "failure",
          });

          result.failed++;
          result.errors.push({
            userId,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }

        result.totalProcessed++;

        // Update job progress
        const progress = (result.totalProcessed / args.userIds.length) * 100;
        await ctx.runMutation(api.mutations.updateJobProgress, {
          jobId,
          processedItems: result.totalProcessed,
          progress,
          status: "running",
        });
      }
    }

    // Update job completion
    result.timeElapsed = Date.now() - startTime;
    await ctx.runMutation(api.mutations.updateJobProgress, {
      jobId,
      processedItems: result.totalProcessed,
      progress: 100,
      status: "completed",
      completedAt: Date.now(),
    });

    return result;
  },
}); 