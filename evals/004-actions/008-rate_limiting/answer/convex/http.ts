import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

// Rate limit configuration
const RATE_LIMIT_CONFIG = {
  maxTokens: 10,        // Maximum tokens per user
  refillRate: 1,        // Tokens per second
  refillInterval: 60,   // Seconds between refills
  minWaitTime: 1000,    // Minimum ms between requests
};

// Helper to calculate available tokens
function calculateTokens(currentTokens: number, lastRefill: number): {
  tokens: number;
  lastRefill: number;
} {
  const now = Date.now();
  const timeDiff = (now - lastRefill) / 1000; // Convert to seconds
  const newTokens = Math.min(
    RATE_LIMIT_CONFIG.maxTokens,
    currentTokens + Math.floor(timeDiff * RATE_LIMIT_CONFIG.refillRate)
  );
  
  return {
    tokens: newTokens,
    lastRefill: now,
  };
}

// Helper to get identifier from request
function getIdentifier(request: Request): string {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7); // Remove "Bearer " prefix
  }
  // Fallback to IP address
  const forwardedFor = request.headers.get("X-Forwarded-For");
  return forwardedFor?.split(",")[0].trim() ?? "unknown";
}

export const rateLimitedApi = httpAction(async (ctx, request) => {
  const startTime = Date.now();
  const identifier = getIdentifier(request);
  
  try {
    // Initialize or get rate limit
    const rateLimitId = await ctx.runMutation(api.mutations.initializeRateLimit, {
      identifier,
      maxTokens: RATE_LIMIT_CONFIG.maxTokens,
    });
    
    // Get current rate limit
    const rateLimit = await ctx.db.get(rateLimitId);
    if (!rateLimit) {
      throw new Error("Failed to initialize rate limit");
    }
    
    // Calculate available tokens
    const { tokens: availableTokens, lastRefill } = calculateTokens(
      rateLimit.tokens,
      rateLimit.lastRefill
    );
    
    // Check if rate limited
    if (availableTokens < 1) {
      const resetTime = lastRefill + RATE_LIMIT_CONFIG.refillInterval * 1000;
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
      
      // Log rate limit exceeded
      await ctx.runMutation(api.mutations.updateRateLimit, {
        identifier,
        tokens: availableTokens,
        lastRefill,
        incrementTotal: true,
        incrementExceeded: true,
      });
      
      // Log API request
      await ctx.runMutation(api.mutations.logApiRequest, {
        identifier,
        endpoint: new URL(request.url).pathname,
        timestamp: Date.now(),
        success: false,
        errorCode: "RATE_LIMITED",
        responseTime: Date.now() - startTime,
      });
      
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          retryAfter,
          limit: RATE_LIMIT_CONFIG.maxTokens,
          remaining: 0,
          reset: resetTime,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": retryAfter.toString(),
            "X-RateLimit-Limit": RATE_LIMIT_CONFIG.maxTokens.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": resetTime.toString(),
          },
        }
      );
    }
    
    // Consume token and update rate limit
    await ctx.runMutation(api.mutations.updateRateLimit, {
      identifier,
      tokens: availableTokens - 1,
      lastRefill,
      incrementTotal: true,
      incrementExceeded: false,
    });
    
    // Process the actual request here
    // This is a mock response - replace with actual API logic
    const responseBody = {
      message: "API request successful",
      timestamp: new Date().toISOString(),
    };
    
    // Log successful API request
    await ctx.runMutation(api.mutations.logApiRequest, {
      identifier,
      endpoint: new URL(request.url).pathname,
      timestamp: Date.now(),
      success: true,
      responseTime: Date.now() - startTime,
    });
    
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Limit": RATE_LIMIT_CONFIG.maxTokens.toString(),
        "X-RateLimit-Remaining": (availableTokens - 1).toString(),
        "X-RateLimit-Reset": (lastRefill + RATE_LIMIT_CONFIG.refillInterval * 1000).toString(),
      },
    });
  } catch (error) {
    // Log error
    await ctx.runMutation(api.mutations.logApiRequest, {
      identifier,
      endpoint: new URL(request.url).pathname,
      timestamp: Date.now(),
      success: false,
      errorCode: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      responseTime: Date.now() - startTime,
    });
    
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}); 