import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const insertProducts = mutation({
  handler: async (ctx) => {
    await ctx.db.insert("products", {
      name: "Laptop",
      price: 999.99,
      inStock: true,
    });
    await ctx.db.insert("products", {
      name: "Headphones",
      price: 149.99,
      inStock: true,
    });
    await ctx.db.insert("products", {
      name: "Keyboard",
      price: 79.99,
      inStock: false,
    });
  },
});

export const getAllProducts = query({
  handler: async (ctx) => {
    return await ctx.db.query("products").collect();
  },
});
