#!/usr/bin/env bun
/**
 * Output top benchmark-ranked OpenRouter models as JSON for use in CI workflows.
 * We fetch OpenRouter's rankings page, extract the embedded "agentic" benchmark
 * leaderboard data, take the top N unique OpenRouter slugs by score, then keep
 * only the models that are due according to the shared model scheduling policy
 * and still look runnable on OpenRouter.
 *
 * Usage:
 *   bun run scripts/listTopOpenRouterBenchmarkModels.ts --limit 10 --format json
 */
import { ConvexHttpClient } from "convex/browser";
import {
  discoverOpenRouterModel,
  preflightOpenRouterEndpoint,
} from "../runner/models/openRouterDiscovery.js";
import {
  shouldKeepDespitePreflightFailure,
  shouldSkipForMissingEndpoint,
} from "./listTopOpenRouterModels.js";
import { loadSchedulingDecisions } from "./modelScheduling.js";

const OPENROUTER_RANKINGS_URL = "https://openrouter.ai/rankings?view=day";
const DEFAULT_LIMIT = 10;
const BENCHMARK_KEY = "agentic";

interface BenchmarkRow {
  openrouter_slug?: string | null;
  heuristic_openrouter_slug?: string | null;
  score?: number;
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

export function extractEscapedJsonArray(html: string, key: string): string {
  const marker = `\\"${key}\\":[`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Could not find ${key} benchmark data in rankings page`);
  }

  const arrayStart = markerIndex + marker.length - 1;
  let depth = 0;
  for (let i = arrayStart; i < html.length; i++) {
    const char = html[i];
    if (char === "[") depth++;
    if (char === "]") {
      depth--;
      if (depth === 0) {
        return html.slice(arrayStart, i + 1);
      }
    }
  }

  throw new Error(`Could not parse ${key} benchmark array from rankings page`);
}

async function fetchAgenticBenchmarkRows(): Promise<BenchmarkRow[]> {
  const response = await fetch(OPENROUTER_RANKINGS_URL, {
    headers: {
      Accept: "text/html",
      "User-Agent": "Mozilla/5.0 (compatible; convex-evals-ci/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch OpenRouter rankings page: ${response.status} ${response.statusText}`,
    );
  }

  const html = await response.text();
  const rawArray = extractEscapedJsonArray(html, BENCHMARK_KEY);
  const normalized = rawArray.replace(/\\"/g, '"');
  const rows = JSON.parse(normalized) as BenchmarkRow[];

  if (!Array.isArray(rows)) {
    throw new Error(`Unexpected ${BENCHMARK_KEY} benchmark payload shape`);
  }

  return rows;
}

export function selectTopModels(rows: BenchmarkRow[], limit: number): string[] {
  const selected: string[] = [];
  const sortedRows = [...rows].sort(
    (a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity),
  );

  for (const row of sortedRows) {
    const slug = row.openrouter_slug ?? row.heuristic_openrouter_slug;
    if (typeof slug !== "string" || slug.length === 0) continue;
    if (selected.includes(slug)) continue;
    selected.push(slug);
    if (selected.length >= limit) break;
  }

  return selected;
}

async function filterDueModels(models: string[]): Promise<string[]> {
  const convexUrl = process.env.CONVEX_EVAL_URL;
  if (!convexUrl) {
    console.error(
      "CONVEX_EVAL_URL not set, returning benchmark models without recency filtering",
    );
    return models;
  }

  const client = new ConvexHttpClient(convexUrl);
  const schedulingDecisions = await loadSchedulingDecisions(client, models);

  return models.filter((model) => {
    return schedulingDecisions.get(model)?.isDue ?? true;
  });
}

async function filterRunnableModels(models: string[]): Promise<string[]> {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterApiKey) {
    console.error(
      "OPENROUTER_API_KEY not set, returning benchmark models without preflight filtering",
    );
    return models;
  }

  const settled = await Promise.all(
    models.map(async (modelName) => {
      try {
        const discovered = await discoverOpenRouterModel(modelName);
        if (!discovered) {
          console.error(`Skipping ${modelName}: not discoverable on OpenRouter`);
          return null;
        }
        await preflightOpenRouterEndpoint(discovered.template, openRouterApiKey);
        return modelName;
      } catch (error) {
        if (shouldSkipForMissingEndpoint(error)) {
          console.error(`Skipping ${modelName}: ${String(error)}`);
          return null;
        }
        if (shouldKeepDespitePreflightFailure(error)) {
          console.error(
            `Keeping ${modelName} despite preflight provider error: ${String(error)}`,
          );
          return modelName;
        }
        console.error(`Skipping ${modelName}: ${String(error)}`);
        return null;
      }
    }),
  );

  return settled.filter((modelName): modelName is string => modelName !== null);
}

export async function main(): Promise<void> {
  const { limit, format } = parseArgs();
  const benchmarkRows = await fetchAgenticBenchmarkRows();
  const topModels = selectTopModels(benchmarkRows, limit);
  const dueModels = await filterDueModels(topModels);
  const models = await filterRunnableModels(dueModels);

  if (format === "json") {
    console.log(JSON.stringify(models));
  } else {
    console.log(models.join(","));
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
