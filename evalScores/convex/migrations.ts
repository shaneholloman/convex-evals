import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api.js";
import type { DataModel, Id } from "./_generated/dataModel.js";

export const migrations = new Migrations<DataModel>(components.migrations);

const OLD_TO_NEW_MODEL_NAMES: Record<string, string> = {
  "claude-3-5-sonnet-latest": "anthropic/claude-3.5-sonnet",
  "claude-3-7-sonnet-latest": "anthropic/claude-3.7-sonnet",
  "claude-sonnet-4-0": "anthropic/claude-sonnet-4",
  "claude-sonnet-4-5": "anthropic/claude-sonnet-4.5",
  "claude-haiku-4-5": "anthropic/claude-haiku-4.5",
  "claude-opus-4-5": "anthropic/claude-opus-4.5",
  "claude-opus-4-6": "anthropic/claude-opus-4.6",
  "o4-mini": "openai/o4-mini",
  "gpt-4.1": "openai/gpt-4.1",
  "gpt-5.1": "openai/gpt-5.1",
  "gpt-5.2": "openai/gpt-5.2",
  "gpt-5": "openai/gpt-5",
  "gpt-5-mini": "openai/gpt-5-mini",
  "gpt-5-nano": "openai/gpt-5-nano",
  "gpt-5.2-codex": "openai/gpt-5.2-codex",
  "deepseek-ai/DeepSeek-V3": "deepseek/deepseek-chat-v3",
  "deepseek-ai/DeepSeek-R1": "deepseek/deepseek-r1",
  "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8":
    "meta-llama/llama-4-maverick",
  "Qwen/Qwen3-235B-A22B-Instruct-2507-tput": "qwen/qwen3-235b-a22b",
  "kimi-k2-0905-preview": "moonshotai/kimi-k2-0905",
  "kimi-k2.5": "moonshotai/kimi-k2.5",
  "gemini-2.5-flash": "google/gemini-2.5-flash",
  "gemini-2.5-pro": "google/gemini-2.5-pro",
  "gemini-3-pro-preview": "google/gemini-3-pro-preview",
  "grok-4": "x-ai/grok-4",
  "grok-3-mini-beta": "x-ai/grok-3-mini-beta",
  "zai-org/GLM-4.7": "z-ai/glm-4.7",
};

function toCanonicalSlug(slug: string): string {
  return OLD_TO_NEW_MODEL_NAMES[slug] ?? slug;
}

function inferProvider(slug: string, fallback?: string): string {
  if (fallback && fallback.length > 0) return fallback;
  const slashIndex = slug.indexOf("/");
  if (slashIndex <= 0) return "openrouter";
  return slug.slice(0, slashIndex);
}

function inferApiKind(slug: string): "chat" | "responses" {
  if (slug.startsWith("openai/") && slug.includes("codex")) return "responses";
  return "chat";
}

async function getOrCreateModelId(
  ctx: { db: any },
  slugRaw: string,
  formattedNameRaw: string | undefined,
  providerRaw: string | undefined,
): Promise<Id<"models">> {
  const slug = toCanonicalSlug(slugRaw);
  const now = Date.now();
  const existing = await ctx.db
    .query("models")
    .withIndex("by_slug", (q: any) => q.eq("slug", slug))
    .unique();
  const formattedName =
    formattedNameRaw && formattedNameRaw.length > 0 ? formattedNameRaw : slug;
  const provider = inferProvider(slug, providerRaw);
  const apiKind = inferApiKind(slug);

  if (existing) {
    await ctx.db.patch(existing._id, {
      formattedName,
      provider,
      apiKind,
      updatedAt: now,
      lastSeenAt: now,
    });
    return existing._id;
  }

  return await ctx.db.insert("models", {
    slug,
    formattedName,
    provider,
    apiKind,
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  });
}

export const backfillRunsModelId = migrations.define({
  table: "runs",
  migrateOne: async (ctx, doc) => {
    const anyDoc = doc as any;
    if (anyDoc.modelId) return;
    const modelSlug = typeof anyDoc.model === "string" ? anyDoc.model : "unknown-model";
    const modelId = await getOrCreateModelId(
      ctx,
      modelSlug,
      typeof anyDoc.formattedName === "string" ? anyDoc.formattedName : undefined,
      typeof anyDoc.provider === "string" ? anyDoc.provider : undefined,
    );
    return { modelId };
  },
});

export const backfillModelScoresModelId = migrations.define({
  table: "modelScores",
  migrateOne: async (ctx, doc) => {
    const anyDoc = doc as any;
    if (anyDoc.modelId) return;
    const modelSlug = typeof anyDoc.model === "string" ? anyDoc.model : "unknown-model";
    const modelId = await getOrCreateModelId(
      ctx,
      modelSlug,
      typeof anyDoc.formattedName === "string" ? anyDoc.formattedName : undefined,
      undefined,
    );
    return { modelId };
  },
});

export const backfillExperimentsModelIds = migrations.define({
  table: "experiments",
  migrateOne: async (ctx, doc) => {
    const anyDoc = doc as any;
    if (!Array.isArray(anyDoc.models) || anyDoc.models.length === 0) return;
    const ids: Id<"models">[] = [];
    for (const entry of anyDoc.models as unknown[]) {
      if (typeof entry !== "string") continue;
      const canonical = toCanonicalSlug(entry);
      const possibleId = canonical as Id<"models">;
      let maybeModelDoc: any = null;
      try {
        maybeModelDoc = await ctx.db.get(possibleId);
      } catch {
        maybeModelDoc = null;
      }
      if (maybeModelDoc && "slug" in maybeModelDoc) {
        ids.push(possibleId);
      } else {
        const modelId = await getOrCreateModelId(
          ctx,
          canonical,
          undefined,
          undefined,
        );
        ids.push(modelId);
      }
    }
    return { models: [...new Set(ids)] };
  },
});

export const repairExperimentsModelIds = migrations.define({
  table: "experiments",
  migrateOne: async (ctx, doc) => {
    const anyDoc = doc as any;
    if (!Array.isArray(anyDoc.models) || anyDoc.models.length === 0) return;
    const ids: Id<"models">[] = [];
    for (const entry of anyDoc.models as unknown[]) {
      if (typeof entry !== "string") continue;
      const canonical = toCanonicalSlug(entry);
      const possibleId = canonical as Id<"models">;
      let maybeModelDoc: any = null;
      try {
        maybeModelDoc = await ctx.db.get(possibleId);
      } catch {
        maybeModelDoc = null;
      }
      if (maybeModelDoc && "slug" in maybeModelDoc) {
        ids.push(possibleId);
      } else {
        const modelId = await getOrCreateModelId(
          ctx,
          canonical,
          undefined,
          undefined,
        );
        ids.push(modelId);
      }
    }
    return { models: [...new Set(ids)] };
  },
});

export const run = migrations.runner();

export const runAll = migrations.runner([
  internal.migrations.backfillRunsModelId,
  internal.migrations.backfillModelScoresModelId,
  internal.migrations.backfillExperimentsModelIds,
  internal.migrations.repairExperimentsModelIds,
]);
