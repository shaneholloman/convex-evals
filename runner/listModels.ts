#!/usr/bin/env bun
/**
 * Output model names as JSON for use in CI workflows.
 * Keeps runner/models/index.ts as the single source of truth.
 *
 * Usage:
 *   bun run runner/listModels.ts --frequency daily --format json
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../evalScores/convex/_generated/api.js";
import { ALL_MODELS, type CIRunFrequency, type ModelTemplate } from "./models/index.js";

const RUN_INTERVAL_MS: Record<CIRunFrequency, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
  never: Number.POSITIVE_INFINITY,
};

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
  const modelDocs = await Promise.all(
    models.map((model) => client.query(api.models.getBySlug, { slug: model.name })),
  );
  const existingModelIds = modelDocs
    .filter((modelDoc) => modelDoc !== null)
    .map((modelDoc) => modelDoc._id);
  const modelSummaries =
    existingModelIds.length > 0
      ? await client.query(api.runs.listModels, { modelIds: existingModelIds })
      : [];
  const now = Date.now();

  return models.filter((model) => {
    const lastRunTime =
      modelSummaries.find((entry) => entry.slug === model.name)?.latestRun ?? null;
    if (lastRunTime === null) return true;
    return now - lastRunTime >= RUN_INTERVAL_MS[model.ciRunFrequency];
  });
}

async function main(): Promise<void> {
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
