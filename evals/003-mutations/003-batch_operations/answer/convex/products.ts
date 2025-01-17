import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// Maximum number of operations to process in a single transaction
const BATCH_SIZE = 50;

// Type for stock update input
type StockUpdate = {
  productId: Id<"products">;
  quantity: number;
};

// Type for stock update result
type UpdateResult = {
  productId: Id<"products">;
  success: boolean;
  newStock?: number;
  error?: string;
};

export const batchDiscontinueProducts = mutation({
  args: {
    productIds: v.array(v.id("products")),
  },
  handler: async (ctx, args) => {
    const results = { updated: 0, failed: 0 };
    
    // Process in batches to respect transaction limits
    for (let i = 0; i < args.productIds.length; i += BATCH_SIZE) {
      const batch = args.productIds.slice(i, i + BATCH_SIZE);
      
      // Update each product in the batch
      for (const productId of batch) {
        try {
          const product = await ctx.db.get(productId);
          if (!product) {
            results.failed++;
            continue;
          }

          await ctx.db.patch(productId, {
            discontinued: true,
            stock: 0,
          });
          results.updated++;
        } catch (error) {
          results.failed++;
        }
      }
    }

    return results;
  },
});

export const batchUpdateStock = mutation({
  args: {
    updates: v.array(
      v.object({
        productId: v.id("products"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const results: UpdateResult[] = [];

    // Process in batches to respect transaction limits
    for (let i = 0; i < args.updates.length; i += BATCH_SIZE) {
      const batch = args.updates.slice(i, i + BATCH_SIZE);

      // Process each update in the batch
      for (const update of batch) {
        const result: UpdateResult = {
          productId: update.productId,
          success: false,
        };

        try {
          // Validate the update
          if (!Number.isInteger(update.quantity)) {
            throw new Error("Quantity must be a whole number");
          }

          // Get the product
          const product = await ctx.db.get(update.productId);
          if (!product) {
            throw new Error("Product not found");
          }

          if (product.discontinued) {
            throw new Error("Cannot update discontinued product");
          }

          const newStock = product.stock + update.quantity;
          if (newStock < 0) {
            throw new Error("Insufficient stock");
          }

          // Create stock update record
          const stockUpdate = await ctx.db.insert("stockUpdates", {
            productId: update.productId,
            quantity: update.quantity,
            timestamp: Date.now(),
            status: "pending",
          });

          try {
            // Update the product stock
            await ctx.db.patch(update.productId, {
              stock: newStock,
            });

            // Mark update as applied
            await ctx.db.patch(stockUpdate, {
              status: "applied",
            });

            result.success = true;
            result.newStock = newStock;
          } catch (error) {
            // Rollback: mark update as failed
            await ctx.db.patch(stockUpdate, {
              status: "failed",
              error: error instanceof Error ? error.message : "Unknown error",
            });
            throw error;
          }
        } catch (error) {
          result.error = error instanceof Error ? error.message : "Unknown error";
        }

        results.push(result);
      }
    }

    return results;
  },
}); 