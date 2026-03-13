import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

function toUnixMs(timestamp: number): number {
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
}

export const applyOpenRouterFirstSeenMap = internalMutation({
  args: {
    createdBySlug: v.record(v.string(), v.number()),
  },
  returns: v.object({
    totalModels: v.number(),
    updated: v.number(),
    unchanged: v.number(),
    missingInOpenRouter: v.number(),
  }),
  handler: async (ctx, args) => {
    const models = await ctx.db.query("models").collect();
    let updated = 0;
    let unchanged = 0;
    let missingInOpenRouter = 0;

    for (const model of models) {
      const nextValue = args.createdBySlug[model.slug];
      if (typeof nextValue !== "number") {
        missingInOpenRouter++;
        continue;
      }
      if (model.openRouterFirstSeenAt === nextValue) {
        unchanged++;
        continue;
      }
      await ctx.db.patch(model._id, {
        openRouterFirstSeenAt: nextValue,
        updatedAt: Date.now(),
      });
      updated++;
    }

    return {
      totalModels: models.length,
      updated,
      unchanged,
      missingInOpenRouter,
    };
  },
});

export const reconcileFromOpenRouter = internalAction({
  args: {},
  returns: v.object({
    fetchedEntries: v.number(),
    totalModels: v.number(),
    updated: v.number(),
    unchanged: v.number(),
    missingInOpenRouter: v.number(),
  }),
  handler: async (
    ctx,
  ): Promise<{
    fetchedEntries: number;
    totalModels: number;
    updated: number;
    unchanged: number;
    missingInOpenRouter: number;
  }> => {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "convex-evals-reconcile/1.0",
      },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch OpenRouter models: ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as {
      data?: Array<{
        id?: string;
        canonical_slug?: string;
        created?: number;
      }>;
    };
    if (!Array.isArray(payload.data)) {
      throw new Error("Unexpected OpenRouter models response shape");
    }

    const createdBySlug: Record<string, number> = {};
    for (const model of payload.data) {
      if (typeof model.created !== "number") continue;
      const createdMs = toUnixMs(model.created);
      if (typeof model.id === "string") {
        createdBySlug[model.id] = createdMs;
      }
      if (typeof model.canonical_slug === "string") {
        createdBySlug[model.canonical_slug] = createdMs;
      }
    }

    const result: {
      totalModels: number;
      updated: number;
      unchanged: number;
      missingInOpenRouter: number;
    } = await ctx.runMutation(
      internal.openRouterReconcile.applyOpenRouterFirstSeenMap,
      { createdBySlug },
    );

    return {
      fetchedEntries: payload.data.length,
      ...result,
    };
  },
});
