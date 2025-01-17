import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// Payment processing error class
class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentError";
  }
}

// Maximum amount in cents (1 million dollars)
const MAX_AMOUNT = 100_000_000;

export const processPayment = mutation({
  args: {
    accountId: v.id("accounts"),
    amount: v.number(),
    idempotencyKey: v.string(),
    metadata: v.object({
      description: v.string(),
      category: v.optional(v.string()),
      reference: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    // 1. Check for existing transaction with same idempotency key
    const existingTransaction = await ctx.db
      .query("transactions")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();

    if (existingTransaction) {
      // Return cached result for duplicate request
      const latestAttempt = await ctx.db
        .query("transactionAttempts")
        .withIndex("by_transaction", (q) =>
          q.eq("transactionId", existingTransaction._id)
        )
        .order("desc")
        .first();

      const account = await ctx.db.get(args.accountId);
      return {
        transaction: existingTransaction,
        balance: account?.balance ?? 0,
        attempt: latestAttempt,
      };
    }

    // 2. Validate amount
    if (args.amount <= 0) {
      throw new PaymentError("Amount must be positive");
    }
    if (args.amount > MAX_AMOUNT) {
      throw new PaymentError("Amount exceeds maximum allowed");
    }

    // 3. Get and validate account
    const account = await ctx.db.get(args.accountId);
    if (!account) {
      throw new PaymentError("Account not found");
    }
    if (account.status !== "active") {
      throw new PaymentError(`Account is ${account.status}`);
    }

    // 4. Get and validate user
    const user = await ctx.db.get(account.userId);
    if (!user) {
      throw new PaymentError("User not found");
    }
    if (user.status !== "active") {
      throw new PaymentError("User account is suspended");
    }

    // 5. Check balance
    if (account.balance < args.amount) {
      throw new PaymentError("Insufficient funds");
    }

    // 6. Create transaction record
    const transaction = await ctx.db.insert("transactions", {
      accountId: args.accountId,
      type: "withdrawal",
      amount: args.amount,
      status: "pending",
      idempotencyKey: args.idempotencyKey,
      metadata: args.metadata,
      timestamp: Date.now(),
    });

    // 7. Create attempt record
    const attempt = await ctx.db.insert("transactionAttempts", {
      transactionId: transaction,
      attemptNumber: 1,
      status: "started",
      timestamp: Date.now(),
    });

    try {
      // 8. Process payment (deduct balance)
      const updatedAccount = await ctx.db.patch(args.accountId, {
        balance: account.balance - args.amount,
        lastTransaction: Date.now(),
      });

      // 9. Update transaction and attempt status
      const completedTransaction = await ctx.db.patch(transaction, {
        status: "completed",
        completedAt: Date.now(),
      });

      const successfulAttempt = await ctx.db.patch(attempt, {
        status: "succeeded",
      });

      return {
        transaction: completedTransaction,
        balance: updatedAccount.balance,
        attempt: successfulAttempt,
      };
    } catch (error) {
      // 10. Handle failure
      await ctx.db.patch(transaction, {
        status: "failed",
      });

      await ctx.db.patch(attempt, {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });

      throw error;
    }
  },
}); 