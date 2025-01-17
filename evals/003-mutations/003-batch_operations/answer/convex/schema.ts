import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  products: defineTable({
    name: v.string(),
    price: v.number(),
    stock: v.number(),
    category: v.string(),
    discontinued: v.boolean(),
  }).index("by_category", ["category"]),  // Index for category-based queries

  stockUpdates: defineTable({
    productId: v.id("products"),
    quantity: v.number(),
    timestamp: v.number(),
    status: v.union(v.literal("pending"), v.literal("applied"), v.literal("failed")),
    error: v.optional(v.string()),
  })
    .index("by_product", ["productId"])  // Index for finding updates for a product
    .index("by_status", ["status"]),     // Index for finding pending/failed updates
}); 