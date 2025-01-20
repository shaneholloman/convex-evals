import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  orders: defineTable({
    customerId: v.string(),
    productId: v.string(),
    quantity: v.number(),
    pricePerUnit: v.number(),
  }).index("by_customer", ["customerId"]),
});
