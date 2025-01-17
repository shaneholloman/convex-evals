import { action } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { v4 as uuidv4 } from "uuid";

// Sleep function for simulating processing time
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Operation type validation
const VALID_OPERATIONS = new Set(["analyze", "transform", "validate"]);

// Simulated operation functions
const operations = {
  analyze: async (content: string) => {
    await sleep(500); // Simulate analysis time
    const sentiment = Math.random() > 0.5 ? "positive" : "negative";
    const score = Math.random();
    return { sentiment, score };
  },
  transform: async (content: string) => {
    await sleep(300); // Simulate transformation time
    return {
      originalLength: content.length,
      transformed: content.toUpperCase(),
    };
  },
  validate: async (content: string) => {
    await sleep(200); // Simulate validation time
    const isValid = content.length > 0;
    return {
      isValid,
      length: content.length,
      hasSpecialChars: /[^a-zA-Z0-9\s]/.test(content),
    };
  },
};

export const innerAction = action({
  args: {
    documentId: v.id("documents"),
    operation: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    timing: { start: number; end: number; duration: number };
    result?: any;
    error?: string;
  }> => {
    const startTime = Date.now();

    try {
      // Validate operation
      if (!VALID_OPERATIONS.has(args.operation)) {
        throw new Error(`Invalid operation: ${args.operation}`);
      }

      // Get document
      const doc = await ctx.runQuery(api.queries.getDocument, {
        documentId: args.documentId,
      });
      if (!doc) {
        throw new Error(`Document ${args.documentId} not found`);
      }

      // Update document status
      await ctx.runMutation(api.mutations.updateDocumentStatus, {
        documentId: args.documentId,
        status: "processing",
        lastOperation: args.operation,
      });

      // Perform operation
      const operationFn = operations[args.operation as keyof typeof operations];
      const result = await operationFn(doc.content);

      // Store successful result
      const endTime = Date.now();
      await ctx.runMutation(api.mutations.storeOperationResult, {
        documentId: args.documentId,
        operation: args.operation,
        startTime,
        endTime,
        success: true,
        result,
      });

      // Update document status
      await ctx.runMutation(api.mutations.updateDocumentStatus, {
        documentId: args.documentId,
        status: "completed",
        lastOperation: args.operation,
      });

      return {
        success: true,
        timing: {
          start: startTime,
          end: endTime,
          duration: endTime - startTime,
        },
        result,
      };
    } catch (error) {
      // Handle error
      const endTime = Date.now();
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Store failed result
      await ctx.runMutation(api.mutations.storeOperationResult, {
        documentId: args.documentId,
        operation: args.operation,
        startTime,
        endTime,
        success: false,
        error: errorMessage,
      });

      // Update document status
      await ctx.runMutation(api.mutations.updateDocumentStatus, {
        documentId: args.documentId,
        status: "failed",
        lastOperation: args.operation,
      });

      return {
        success: false,
        timing: {
          start: startTime,
          end: endTime,
          duration: endTime - startTime,
        },
        error: errorMessage,
      };
    }
  },
});

type Task = {
  documentId: Id<"documents">;
  operation: string;
};

type BatchResult = {
  batchId: string;
  results: Array<{
    documentId: Id<"documents">;
    operation: string;
    success: boolean;
    timing: {
      start: number;
      end: number;
      duration: number;
    };
    result?: any;
    error?: string;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
    totalTime: number;
  };
};

export const outerAction = action({
  args: {
    tasks: v.array(
      v.object({
        documentId: v.id("documents"),
        operation: v.string(),
      })
    ),
  },
  handler: async (ctx, args): Promise<BatchResult> => {
    const batchId = uuidv4();
    const startTime = Date.now();

    // Process all tasks in parallel
    const results = await Promise.all(
      args.tasks.map(async (task) => {
        const result = await ctx.runAction(api.actions.innerAction, task);
        return {
          documentId: task.documentId,
          operation: task.operation,
          ...result,
        };
      })
    );

    // Calculate summary
    const summary = {
      total: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      totalTime: Date.now() - startTime,
    };

    return {
      batchId,
      results,
      summary,
    };
  },
}); 