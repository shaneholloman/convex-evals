#!/usr/bin/env bun
/**
 * Output top OpenRouter models as JSON for use in CI workflows.
 * We fetch OpenRouter's "top weekly" ordering, take the first N unique model
 * slugs, then keep only the models that have not run within the last 24 hours.
 *
 * Usage:
 *   bun run runner/listTopOpenRouterModels.ts --limit 15 --format json
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../evalScores/convex/_generated/api.js";
import { ALL_MODELS } from "./models/index.js";

const OPENROUTER_TOP_MODELS_URL =
  "https://openrouter.ai/api/frontend/models/find?order=top-weekly";
const DEFAULT_LIMIT = 15;
const DEFAULT_MIN_AGE_HOURS = 24;

interface OpenRouterFrontendModel {
  slug?: string;
}

interface OpenRouterFrontendResponse {
  data?: {
    models?: OpenRouterFrontendModel[];
  };
}

function parseArgs(): { limit: number; format: string; minAgeHours: number } {
  const args = process.argv.slice(2);
  let limit = DEFAULT_LIMIT;
  let format = "json";
  let minAgeHours = DEFAULT_MIN_AGE_HOURS;

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
    if (args[i] === "--min-age-hours" && args[i + 1]) {
      const parsed = Number.parseInt(args[++i], 10);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        minAgeHours = parsed;
      }
    }
  }

  return { limit, format, minAgeHours };
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

async function filterDueModels(
  models: string[],
  minAgeHours: number,
): Promise<string[]> {
  const convexUrl = process.env.CONVEX_EVAL_URL;
  if (!convexUrl) {
    console.error(
      "CONVEX_EVAL_URL not set, returning top models without recency filtering",
    );
    return models;
  }

  const client = new ConvexHttpClient(convexUrl);
  const modelDocs = await Promise.all(
    models.map((slug) => client.query(api.models.getBySlug, { slug })),
  );
  const existingModelIds = modelDocs
    .filter((modelDoc) => modelDoc !== null)
    .map((modelDoc) => modelDoc._id);
  const modelSummaries =
    existingModelIds.length > 0
      ? await client.query(api.runs.listModels, { modelIds: existingModelIds })
      : [];
  const minAgeMs = minAgeHours * 60 * 60 * 1000;
  const now = Date.now();

  return models.filter((model) => {
    const lastRunTime =
      modelSummaries.find((entry) => entry.slug === model)?.latestRun ?? null;
    return lastRunTime === null || now - lastRunTime >= minAgeMs;
  });
}

async function main(): Promise<void> {
  const { limit, format, minAgeHours } = parseArgs();
  const topSlugs = await fetchTopWeeklySlugs();
  const topModels = selectTopModels(topSlugs, limit);
  const knownModels = new Set(ALL_MODELS.map((model) => model.name));
  const uncategorizedModels = topModels.filter((model) => !knownModels.has(model));
  const models = await filterDueModels(uncategorizedModels, minAgeHours);

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
