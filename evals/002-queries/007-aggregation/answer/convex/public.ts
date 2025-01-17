import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const insertOrders = mutation({
  handler: async (ctx) => {
    // Customer 1: Multiple orders of various products
    await ctx.db.insert("orders", {
      customerId: "customer1",
      productId: "laptop",
      quantity: 1,
      pricePerUnit: 999.99,
    });
    await ctx.db.insert("orders", {
      customerId: "customer1",
      productId: "mouse",
      quantity: 2,
      pricePerUnit: 49.99,
    });
    await ctx.db.insert("orders", {
      customerId: "customer1",
      productId: "keyboard",
      quantity: 1,
      pricePerUnit: 149.99,
    });

    // Customer 2: Bulk orders of fewer products
    await ctx.db.insert("orders", {
      customerId: "customer2",
      productId: "monitor",
      quantity: 3,
      pricePerUnit: 299.99,
    });
    await ctx.db.insert("orders", {
      customerId: "customer2",
      productId: "mouse",
      quantity: 5,
      pricePerUnit: 49.99,
    });
    await ctx.db.insert("orders", {
      customerId: "customer2",
      productId: "laptop",
      quantity: 2,
      pricePerUnit: 999.99,
    });
  },
});

export const getCustomerStats = query({
  args: { customerId: v.string() },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();

    if (orders.length === 0) {
      return {
        totalOrders: 0,
        totalItems: 0,
        totalSpent: 0,
        averageOrderValue: 0,
      };
    }

    const stats = orders.reduce(
      (acc, order) => ({
        totalOrders: acc.totalOrders + 1,
        totalItems: acc.totalItems + order.quantity,
        totalSpent: acc.totalSpent + order.quantity * order.pricePerUnit,
      }),
      { totalOrders: 0, totalItems: 0, totalSpent: 0 }
    );

    return {
      ...stats,
      // Format monetary values to 2 decimal places
      totalSpent: Number(stats.totalSpent.toFixed(2)),
      averageOrderValue: Number((stats.totalSpent / stats.totalOrders).toFixed(2)),
    };
  },
});
