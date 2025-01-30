import { action } from "./_generated/server";
import { v } from "convex/values";

/**
 * Demonstrates making an external HTTP request to httpbin.org
 * Returns the parsed JSON response from the service.
 */
export const fetchFromHttpBin = action({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const response = await fetch("https://httpbin.org/get");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data = await response.json();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return data;
  },
});