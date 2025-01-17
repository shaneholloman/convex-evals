import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const setCacheEntry = mutation({
  args: {
    key: v.string(),
    value: v.any(),
    ttl: v.number(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("cache_entries")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (existing) {
      return await ctx.db.patch(existing._id, {
        value: args.value,
        createdAt: now,
        expiresAt: now + args.ttl * 1000,
        lastAccessed: now,
        size: args.size,
      });
    }

    return await ctx.db.insert("cache_entries", {
      key: args.key,
      value: args.value,
      createdAt: now,
      expiresAt: now + args.ttl * 1000,
      lastAccessed: now,
      accessCount: 0,
      size: args.size,
    });
  },
});

export const updateCacheAccess = mutation({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("cache_entries")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (!entry) {
      throw new Error(`Cache entry not found: ${args.key}`);
    }

    return await ctx.db.patch(entry._id, {
      lastAccessed: Date.now(),
      accessCount: entry.accessCount + 1,
    });
  },
});

export const invalidateCache = mutation({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("cache_entries")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (entry) {
      await ctx.db.delete(entry._id);
    }
  },
});

export const evictExpiredEntries = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("cache_entries")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", now))
      .collect();

    let evictionCount = 0;
    for (const entry of expired) {
      await ctx.db.delete(entry._id);
      evictionCount++;
    }

    return evictionCount;
  },
});

export const evictLRUEntries = mutation({
  args: {
    count: v.number(),
  },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("cache_entries")
      .withIndex("by_last_accessed")
      .take(args.count);

    let evictionCount = 0;
    for (const entry of entries) {
      await ctx.db.delete(entry._id);
      evictionCount++;
    }

    return evictionCount;
  },
});

export const recordCacheMetrics = mutation({
  args: {
    hits: v.number(),
    misses: v.number(),
    evictions: v.number(),
    totalSize: v.number(),
    avgLatency: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("cache_metrics", {
      timestamp: Date.now(),
      ...args,
    });
  },
}); 