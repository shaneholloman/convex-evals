/**
 * Database migrations for the evalScores backend.
 *
 * Run all migrations after deploying:
 *   cd evalScores && npx convex run migrations:runAll --prod
 *
 * Monitor progress:
 *   npx convex run --component migrations lib:getStatus --watch --prod
 */
import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api.js";
import type { DataModel } from "./_generated/dataModel.js";

export const migrations = new Migrations<DataModel>(components.migrations);

// ── Static model lookup tables ───────────────────────────────────────
// Hardcoded from runner/models/index.ts so the migration can run inside
// the Convex backend (which doesn't have access to runner code).

const MODEL_FORMATTED_NAMES: Record<string, string> = {
  "claude-3-5-sonnet-latest": "Claude 3.5 Sonnet",
  "claude-3-7-sonnet-latest": "Claude 3.7 Sonnet",
  "claude-sonnet-4-0": "Claude 4 Sonnet",
  "claude-sonnet-4-5": "Claude 4.5 Sonnet",
  "claude-haiku-4-5": "Claude 4.5 Haiku",
  "claude-opus-4-5": "Claude 4.5 Opus",
  "claude-opus-4-6": "Claude 4.6 Opus",
  "o4-mini": "o4-mini",
  "gpt-4.1": "GPT-4.1",
  "gpt-5.1": "GPT-5.1",
  "gpt-5.2": "GPT-5.2",
  "gpt-5.2-codex": "GPT-5.2 Codex",
  "gpt-5": "GPT-5",
  "gpt-5-mini": "GPT-5 mini",
  "gpt-5-nano": "GPT-5 nano",
  "deepseek-ai/DeepSeek-V3": "DeepSeek V3",
  "deepseek-ai/DeepSeek-R1": "DeepSeek R1",
  "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8": "Llama 4 Maverick",
  "zai-org/GLM-4.7": "GLM 4.7",
  "kimi-k2-0905-preview": "Kimi K2",
  "kimi-k2.5": "Kimi K2.5",
  "Qwen/Qwen3-235B-A22B-Instruct-2507-tput": "Qwen3 235B",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  "gemini-3-pro-preview": "Gemini 3 Pro",
  "grok-4": "Grok 4",
  "grok-3-mini-beta": "Grok 3 Mini (Beta)",
  // Legacy models that may exist in older runs
  "gpt-4o": "GPT-4o",
  "o3-mini": "o3-mini",
  "gemini-2.0-flash-lite": "Gemini 2.0 Flash Lite",
  "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo": "Llama 3.1 405B",
};

const MODEL_PROVIDERS: Record<string, string> = {
  "claude-3-5-sonnet-latest": "anthropic",
  "claude-3-7-sonnet-latest": "anthropic",
  "claude-sonnet-4-0": "anthropic",
  "claude-sonnet-4-5": "anthropic",
  "claude-haiku-4-5": "anthropic",
  "claude-opus-4-5": "anthropic",
  "claude-opus-4-6": "anthropic",
  "o4-mini": "openai",
  "gpt-4.1": "openai",
  "gpt-5.1": "openai",
  "gpt-5.2": "openai",
  "gpt-5.2-codex": "openai",
  "gpt-5": "openai",
  "gpt-5-mini": "openai",
  "gpt-5-nano": "openai",
  "deepseek-ai/DeepSeek-V3": "together",
  "deepseek-ai/DeepSeek-R1": "together",
  "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8": "together",
  "zai-org/GLM-4.7": "together",
  "kimi-k2-0905-preview": "moonshot",
  "kimi-k2.5": "moonshot",
  "Qwen/Qwen3-235B-A22B-Instruct-2507-tput": "together",
  "gemini-2.5-flash": "google",
  "gemini-2.5-pro": "google",
  "gemini-3-pro-preview": "google",
  "grok-4": "xai",
  "grok-3-mini-beta": "xai",
  // Legacy models
  "gpt-4o": "openai",
  "o3-mini": "openai",
  "gemini-2.0-flash-lite": "google",
  "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo": "together",
};

// ── Migration definitions ────────────────────────────────────────────

/**
 * Backfill `formattedName` and `provider` on existing runs that are missing them.
 * After this migration completes, these fields can be made required in the schema.
 */
export const backfillRunFields = migrations.define({
  table: "runs",
  migrateOne: async (_ctx, doc) => {
    const updates: Record<string, string> = {};
    if (doc.formattedName === undefined) {
      updates.formattedName = MODEL_FORMATTED_NAMES[doc.model] ?? doc.model;
    }
    if (doc.provider === undefined) {
      updates.provider = MODEL_PROVIDERS[doc.model] ?? "unknown";
    }
    if (Object.keys(updates).length > 0) return updates;
  },
});

/**
 * Delete all documents from the deprecated evalScores table.
 * After this migration completes, the table can be removed from the schema.
 */
export const deleteEvalScores = migrations.define({
  table: "evalScores",
  migrateOne: async (ctx, doc) => {
    await ctx.db.delete(doc._id);
  },
});

// ── Runner functions ─────────────────────────────────────────────────

/** Run a single named migration via CLI: npx convex run migrations:run '{fn: "migrations:backfillRunFields"}' */
export const run = migrations.runner();

/** Run all migrations in order: npx convex run migrations:runAll --prod */
export const runAll = migrations.runner([
  internal.migrations.backfillRunFields,
  internal.migrations.deleteEvalScores,
]);
