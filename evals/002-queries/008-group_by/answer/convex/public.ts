import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const insertSales = mutation({
  handler: async (ctx) => {
    // North region - March 2024
    await ctx.db.insert("sales", {
      region: "north",
      product: "laptop",
      category: "electronics",
      amount: 1299.99,
      date: "2024-03",
    });
    await ctx.db.insert("sales", {
      region: "north",
      product: "monitor",
      category: "electronics",
      amount: 499.99,
      date: "2024-03",
    });
    await ctx.db.insert("sales", {
      region: "north",
      product: "desk",
      category: "furniture",
      amount: 399.99,
      date: "2024-03",
    });

    // North region - April 2024
    await ctx.db.insert("sales", {
      region: "north",
      product: "chair",
      category: "furniture",
      amount: 299.99,
      date: "2024-04",
    });
    await ctx.db.insert("sales", {
      region: "north",
      product: "tablet",
      category: "electronics",
      amount: 799.99,
      date: "2024-04",
    });

    // South region - March 2024
    await ctx.db.insert("sales", {
      region: "south",
      product: "laptop",
      category: "electronics",
      amount: 1199.99,
      date: "2024-03",
    });
    await ctx.db.insert("sales", {
      region: "south",
      product: "bookshelf",
      category: "furniture",
      amount: 249.99,
      date: "2024-03",
    });

    // South region - April 2024
    await ctx.db.insert("sales", {
      region: "south",
      product: "desk",
      category: "furniture",
      amount: 449.99,
      date: "2024-04",
    });
  },
});

export const getMonthlySalesByCategory = query({
  args: {
    region: v.string(),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_region_date", (q) =>
        q.eq("region", args.region).eq("date", args.date)
      )
      .collect();

    if (sales.length === 0) {
      return [];
    }

    // Group sales by category
    const categoryGroups = sales.reduce((acc, sale) => {
      const { category, amount } = sale;
      if (!acc[category]) {
        acc[category] = {
          category,
          totalSales: 0,
          numberOfSales: 0,
          averageSaleAmount: 0,
        };
      }
      acc[category].totalSales += amount;
      acc[category].numberOfSales += 1;
      return acc;
    }, {} as Record<string, { category: string; totalSales: number; numberOfSales: number; averageSaleAmount: number }>);

    // Calculate averages and format numbers
    const results = Object.values(categoryGroups).map((group) => ({
      category: group.category,
      totalSales: Number(group.totalSales.toFixed(2)),
      numberOfSales: group.numberOfSales,
      averageSaleAmount: Number((group.totalSales / group.numberOfSales).toFixed(2)),
    }));

    // Sort by total sales descending
    return results.sort((a, b) => b.totalSales - a.totalSales);
  },
});
