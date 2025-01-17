import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Valid account statuses
const accountStatuses = ["active", "frozen", "closed"] as const;

// Valid transaction types
const transactionTypes = ["deposit", "withdrawal", "transfer"] as const;

// Valid transaction statuses
const transactionStatuses = [
  "pending",
  "completed",
  "failed",
  "reversed",
] as const;

// Valid attempt statuses
const attemptStatuses = ["started", "succeeded", "failed"] as const;

// Valid user statuses
const userStatuses = ["active", "suspended"] as const;

export default defineSchema({
  accounts: defineTable({
    userId: v.id("users"),
    balance: v.number(),
    currency: v.string(),
    status: v.union(...accountStatuses.map((s) => v.literal(s))),
    lastTransaction: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  transactions: defineTable({
    accountId: v.id("accounts"),
    type: v.union(...transactionTypes.map((t) => v.literal(t))),
    amount: v.number(),
    status: v.union(...transactionStatuses.map((s) => v.literal(s))),
    idempotencyKey: v.string(),
    metadata: v.object({
      description: v.string(),
      category: v.optional(v.string()),
      reference: v.optional(v.string()),
    }),
    timestamp: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_account", ["accountId"])
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_status", ["status"]),

  transactionAttempts: defineTable({
    transactionId: v.id("transactions"),
    attemptNumber: v.number(),
    status: v.union(...attemptStatuses.map((s) => v.literal(s))),
    error: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index("by_transaction", ["transactionId", "attemptNumber"])
    .index("by_status", ["status"]),

  users: defineTable({
    name: v.string(),
    email: v.string(),
    status: v.union(...userStatuses.map((s) => v.literal(s))),
  }).index("by_email", ["email"]),
}); 