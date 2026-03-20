#!/usr/bin/env bun
/**
 * Output model names as JSON for use in CI workflows.
 * Keeps runner/models/index.ts as the single source of truth.
 *
 * Usage:
 *   bun run scripts/listModels.ts --format json
 */
import { ConvexHttpClient } from "convex/browser";
import { ALL_MODELS } from "../runner/models/index.js";
import { loadSchedulingDecisions } from "./modelScheduling.js";

export interface CuratedSelectorOptions {
  dueOnly?: boolean;
}

function parseArgs(): { format: string; dueOnly: boolean } {
  const args = process.argv.slice(2);
  let format = "json";
  let dueOnly = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--format" && args[i + 1]) format = args[++i];
    if (args[i] === "--due-only") dueOnly = true;
  }

  return { format, dueOnly };
}

async function filterDueModels(models: string[]): Promise<string[]> {
  const convexUrl = process.env.CONVEX_EVAL_URL;
  if (!convexUrl) {
    console.error(
      "CONVEX_EVAL_URL not set, returning curated models without recency filtering",
    );
    return models;
  }

  const client = new ConvexHttpClient(convexUrl);
  const schedulingDecisions = await loadSchedulingDecisions(client, models);

  return models.filter((model) => {
    return schedulingDecisions.get(model)?.isDue ?? true;
  });
}

export async function selectCuratedModels(
  options: CuratedSelectorOptions = {},
): Promise<string[]> {
  return options.dueOnly
    ? await filterDueModels([...ALL_MODELS])
    : [...ALL_MODELS];
}

export async function main(): Promise<void> {
  const { format, dueOnly } = parseArgs();
  const models = await selectCuratedModels({
    dueOnly,
  });

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
