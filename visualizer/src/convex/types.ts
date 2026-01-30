/**
 * Convex type definitions for the evalScores backend.
 */

import type { GenericId } from "convex/values";

/**
 * Table names in the evalScores data model.
 */
export type TableNames = "runs" | "evals" | "steps" | "evalAssets" | "evalScores";

/**
 * System table names.
 */
export type SystemTableNames = "_storage" | "_scheduled_functions";

/**
 * An identifier for a document in Convex.
 */
export type Id<TableName extends TableNames | SystemTableNames> = GenericId<TableName>;
