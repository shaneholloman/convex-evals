"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import * as crypto from "node:crypto";
import * as path from "node:path";

// Define the action using Node runtime
export const processWithNode = action({
  args: { data: v.string() },
  handler: async (_ctx, args) => {
    const hash = crypto.createHash("sha256").update(args.data).digest("hex");
    // Keep path behavior deterministic across Windows and Linux.
    const normalizedPath = path.posix.normalize("/some/test/path");

    return {
      hash,
      normalizedPath,
    };
  },
});