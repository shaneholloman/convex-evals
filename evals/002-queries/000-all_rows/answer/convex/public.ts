import { v } from "convex/values";
import { query } from "./_generated/server";

export const getAllProducts = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("products"),
      _creationTime: v.number(),
      name: v.string(),
      price: v.number(),
      inStock: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    return await ctx.db.query("products").collect();
  },
});
