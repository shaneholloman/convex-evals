/* eslint-disable */
/**
 * Convex API types for the evalScores backend.
 * 
 * This is a simplified version that provides type-safe API references
 * without needing to import from the evalScores directory.
 */

import { anyApi } from "convex/server";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api = anyApi as {
  runs: {
    listExperiments: any;
    listRuns: any;
    getRunDetails: any;
    getOutputUrl: any;
  };
};

export const internal = anyApi;
