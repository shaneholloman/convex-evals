import { ConvexReactClient } from "convex/react";

// The Convex deployment URL - must match the evalScores deployment
// Use VITE_ prefix for client-side env vars in Vite
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL || "https://brazen-pelican-414.convex.cloud";

export const convex = new ConvexReactClient(CONVEX_URL);
