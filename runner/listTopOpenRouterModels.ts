#!/usr/bin/env bun
/**
 * Output top OpenRouter models as JSON for use in CI workflows.
 * We fetch OpenRouter's "top weekly" ordering, take the first N model slugs,
 * then keep only models not already curated in runner/models/index.ts.
 *
 * Usage:
 *   bun run runner/listTopOpenRouterModels.ts --limit 15 --format json
 */
import { ALL_MODELS } from "./models/index.js";

const OPENROUTER_TOP_MODELS_URL =
  "https://openrouter.ai/api/frontend/models/find?order=top-weekly";
const DEFAULT_LIMIT = 15;

interface OpenRouterFrontendModel {
  slug?: string;
}

interface OpenRouterFrontendResponse {
  data?: {
    models?: OpenRouterFrontendModel[];
  };
}

function parseArgs(): { limit: number; format: string } {
  const args = process.argv.slice(2);
  let limit = DEFAULT_LIMIT;
  let format = "json";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      const parsed = Number.parseInt(args[++i], 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        limit = parsed;
      }
    }
    if (args[i] === "--format" && args[i + 1]) {
      format = args[++i];
    }
  }

  return { limit, format };
}

async function fetchTopWeeklySlugs(): Promise<string[]> {
  const response = await fetch(OPENROUTER_TOP_MODELS_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "convex-evals-ci/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch OpenRouter top models: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as OpenRouterFrontendResponse;
  const models = payload.data?.models;

  if (!Array.isArray(models)) {
    throw new Error("Unexpected OpenRouter response shape (missing data.models)");
  }

  return models
    .map((model) => model.slug)
    .filter((slug): slug is string => typeof slug === "string" && slug.length > 0);
}

function selectTopModels(slugs: string[], limit: number): string[] {
  const selected: string[] = [];

  for (const slug of slugs) {
    if (selected.includes(slug)) continue;
    selected.push(slug);
    if (selected.length >= limit) break;
  }

  return selected;
}

async function main(): Promise<void> {
  const { limit, format } = parseArgs();
  const topSlugs = await fetchTopWeeklySlugs();
  const topModels = selectTopModels(topSlugs, limit);
  const knownModels = new Set(ALL_MODELS.map((model) => model.name));
  const models = topModels.filter((model) => !knownModels.has(model));

  if (models.length === 0) {
    throw new Error(
      `No new models found in OpenRouter top-${limit} list after excluding curated models`,
    );
  }

  if (format === "json") {
    console.log(JSON.stringify(models));
  } else {
    console.log(models.join(","));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
