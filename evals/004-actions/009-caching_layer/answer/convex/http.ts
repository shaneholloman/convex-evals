import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

// Cache configuration
const CACHE_CONFIG = {
  defaultTTL: 3600,     // Default TTL in seconds
  maxSize: 1048576,     // Maximum cache size in bytes
  maxEntries: 1000,     // Maximum number of entries
  warmupKeys: ["popular_data", "critical_config"],
  evictionPolicy: "lru", // Least Recently Used
};

// Helper to parse Cache-Control header
function parseCacheControl(header: string | null): { maxAge?: number; noCache: boolean } {
  if (!header) return { noCache: false };
  
  const directives = header.split(",").map(d => d.trim().toLowerCase());
  const maxAge = directives
    .find(d => d.startsWith("max-age="))
    ?.split("=")[1];
  
  return {
    maxAge: maxAge ? parseInt(maxAge, 10) : undefined,
    noCache: directives.includes("no-cache"),
  };
}

// Helper to calculate ETag
function calculateETag(value: any): string {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

// Helper to check if cache entry is valid
function isValidCacheEntry(entry: any): boolean {
  return entry && entry.expiresAt > Date.now();
}

// Helper to simulate expensive operation
async function expensiveOperation(key: string): Promise<any> {
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 500));
  
  return {
    data: `Generated data for ${key}`,
    timestamp: new Date().toISOString(),
  };
}

export const cached = httpAction(async (ctx, request) => {
  const startTime = Date.now();
  const url = new URL(request.url);
  const cacheKey = url.pathname.slice(1); // Remove leading slash
  
  try {
    // Parse cache control headers
    const cacheControl = parseCacheControl(request.headers.get("Cache-Control"));
    const ifNoneMatch = request.headers.get("If-None-Match");
    
    // Check if cache should be bypassed
    if (!cacheControl.noCache) {
      // Get cached entry
      const entry = await ctx.db
        .query("cache_entries")
        .withIndex("by_key", (q) => q.eq("key", cacheKey))
        .first();
      
      if (entry && isValidCacheEntry(entry)) {
        // Update access metrics
        await ctx.runMutation(api.mutations.updateCacheAccess, { key: cacheKey });
        
        // Calculate ETag
        const etag = calculateETag(entry.value);
        
        // Check if client has latest version
        if (ifNoneMatch === etag) {
          // Record cache hit
          await ctx.runMutation(api.mutations.recordCacheMetrics, {
            hits: 1,
            misses: 0,
            evictions: 0,
            totalSize: entry.size,
            avgLatency: Date.now() - startTime,
          });
          
          return new Response(null, {
            status: 304,
            headers: {
              "ETag": etag,
              "Cache-Control": `max-age=${Math.floor((entry.expiresAt - Date.now()) / 1000)}`,
              "X-Cache": "HIT",
            },
          });
        }
        
        // Return cached data
        const response = new Response(JSON.stringify({
          data: entry.value,
          cache: {
            hit: true,
            age: Math.floor((Date.now() - entry.createdAt) / 1000),
            ttl: Math.floor((entry.expiresAt - Date.now()) / 1000),
            key: cacheKey,
          },
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "ETag": etag,
            "Cache-Control": `max-age=${Math.floor((entry.expiresAt - Date.now()) / 1000)}`,
            "X-Cache": "HIT",
          },
        });
        
        // Record cache hit
        await ctx.runMutation(api.mutations.recordCacheMetrics, {
          hits: 1,
          misses: 0,
          evictions: 0,
          totalSize: entry.size,
          avgLatency: Date.now() - startTime,
        });
        
        return response;
      }
    }
    
    // Cache miss or bypass - generate new data
    const data = await expensiveOperation(cacheKey);
    const serializedData = JSON.stringify(data);
    const size = Buffer.from(serializedData).length;
    
    // Check cache size and evict if necessary
    const ttl = cacheControl.maxAge ?? CACHE_CONFIG.defaultTTL;
    
    // Store in cache if not bypassed
    if (!cacheControl.noCache) {
      // Evict expired entries first
      const expiredEvictions = await ctx.runMutation(api.mutations.evictExpiredEntries, {});
      
      // If still need space, evict by LRU
      if (size > CACHE_CONFIG.maxSize) {
        const lruEvictions = await ctx.runMutation(api.mutations.evictLRUEntries, {
          count: Math.ceil(size / (CACHE_CONFIG.maxSize / CACHE_CONFIG.maxEntries)),
        });
        
        // Store new entry
        await ctx.runMutation(api.mutations.setCacheEntry, {
          key: cacheKey,
          value: data,
          ttl,
          size,
        });
        
        // Record metrics
        await ctx.runMutation(api.mutations.recordCacheMetrics, {
          hits: 0,
          misses: 1,
          evictions: expiredEvictions + lruEvictions,
          totalSize: size,
          avgLatency: Date.now() - startTime,
        });
      }
    }
    
    // Return fresh data
    const etag = calculateETag(data);
    return new Response(JSON.stringify({
      data,
      cache: {
        hit: false,
        age: 0,
        ttl,
        key: cacheKey,
      },
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "ETag": etag,
        "Cache-Control": `max-age=${ttl}`,
        "X-Cache": cacheControl.noCache ? "BYPASS" : "MISS",
      },
    });
  } catch (error) {
    console.error("Cache error:", error);
    
    // Record error metrics
    await ctx.runMutation(api.mutations.recordCacheMetrics, {
      hits: 0,
      misses: 1,
      evictions: 0,
      totalSize: 0,
      avgLatency: Date.now() - startTime,
    });
    
    return new Response(JSON.stringify({
      error: "Cache error",
      message: error instanceof Error ? error.message : "Unknown error occurred",
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "ERROR",
      },
    });
  }
}); 