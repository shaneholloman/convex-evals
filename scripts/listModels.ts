#!/usr/bin/env bun
/**
 * Output model names as JSON for use in CI workflows.
 * Keeps runner/models/index.ts as the single source of truth.
 *
 * Usage:
 *   bun run scripts/listModels.ts --frequency daily --format json
 */
import { ConvexHttpClient } from "convex/browser";
import {
  ALL_MODELS,
  type CIRunFrequency,
  type ModelTemplate,
} from "../runner/models/index.js";
import { loadSchedulingDecisions } from "./modelScheduling.js";

function getModels(frequency?: CIRunFrequency): ModelTemplate[] {
  let models = ALL_MODELS;
  if (frequency) models = models.filter((m) => m.ciRunFrequency === frequency);
  return models;
}

function parseArgs(): { frequency?: string; format: string; dueOnly: boolean } {
  const args = process.argv.slice(2);
  let frequency: string | undefined;
  let format = "json";
  let dueOnly = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--frequency" && args[i + 1]) frequency = args[++i];
    if (args[i] === "--format" && args[i + 1]) format = args[++i];
    if (args[i] === "--due-only") dueOnly = true;
  }

  return { frequency, format, dueOnly };
}

async function filterDueModels(models: ModelTemplate[]): Promise<ModelTemplate[]> {
  const convexUrl = process.env.CONVEX_EVAL_URL;
  if (!convexUrl) {
    console.error(
      "CONVEX_EVAL_URL not set, returning curated models without recency filtering",
    );
    return models;
  }

  const client = new ConvexHttpClient(convexUrl);
  const schedulingDecisions = await loadSchedulingDecisions(
    client,
    models.map((model) => model.name),
  );

  return models.filter((model) => {
    return schedulingDecisions.get(model.name)?.isDue ?? true;
  });
}

export async function main(): Promise<void> {
  const { frequency, format, dueOnly } = parseArgs();

  const freq =
    frequency && frequency !== "all"
      ? (frequency as CIRunFrequency)
      : undefined;

  const selectedModels = dueOnly
    ? await filterDueModels(getModels(freq))
    : getModels(freq);
  const models = selectedModels.map((m) => m.name);

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
