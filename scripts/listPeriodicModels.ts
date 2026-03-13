#!/usr/bin/env bun
/**
 * Output periodic workflow models as JSON for use in CI workflows.
 * We gather candidates from curated, top-day OpenRouter, and benchmark
 * selectors, then dedupe by slug before expanding the workflow matrix.
 *
 * Usage:
 *   bun run scripts/listPeriodicModels.ts --format json
 */
import { selectCuratedModels } from "./listModels.js";
import { selectTopOpenRouterBenchmarkModels } from "./listTopOpenRouterBenchmarkModels.js";
import { selectTopOpenRouterModels } from "./listTopOpenRouterModels.js";

const DEFAULT_FORMAT = "json";

export interface MergeModelsResult {
  models: string[];
  modelSources: Record<string, string[]>;
}

function parseArgs(): { format: string } {
  const args = process.argv.slice(2);
  let format = DEFAULT_FORMAT;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--format" && args[i + 1]) {
      format = args[++i];
    }
  }

  return { format };
}

export function mergeModelSources(
  sourceEntries: Array<[string, string[]]>,
): MergeModelsResult {
  const models: string[] = [];
  const modelSources = new Map<string, string[]>();

  for (const [sourceName, sourceModels] of sourceEntries) {
    for (const model of sourceModels) {
      const existingSources = modelSources.get(model);
      if (existingSources) {
        existingSources.push(sourceName);
        continue;
      }

      modelSources.set(model, [sourceName]);
      models.push(model);
    }
  }

  return {
    models,
    modelSources: Object.fromEntries(modelSources),
  };
}

function logSelectionSummary(
  sourceEntries: Array<[string, string[]]>,
  merged: MergeModelsResult,
): void {
  const totalCandidates = sourceEntries.reduce(
    (sum, [, sourceModels]) => sum + sourceModels.length,
    0,
  );
  const overlaps = Object.entries(merged.modelSources).filter(
    ([, sources]) => sources.length > 1,
  );

  console.error(
    `Periodic selector counts: ${sourceEntries
      .map(([name, sourceModels]) => `${name}=${sourceModels.length}`)
      .join(", ")}`,
  );
  console.error(
    `Periodic selector merged ${totalCandidates} candidates into ${merged.models.length} unique models`,
  );
  if (overlaps.length > 0) {
    console.error(
      `Periodic selector overlaps: ${overlaps
        .map(([model, sources]) => `${model} (${sources.join(", ")})`)
        .join("; ")}`,
    );
  }
}

export async function selectPeriodicModels(): Promise<string[]> {
  const [curatedModels, topOpenRouterModels, benchmarkModels] = await Promise.all([
    selectCuratedModels({ dueOnly: true }),
    selectTopOpenRouterModels({ limit: 15 }),
    selectTopOpenRouterBenchmarkModels({ limit: 10 }),
  ]);

  const merged = mergeModelSources([
    ["curated", curatedModels],
    ["top-day", topOpenRouterModels],
    ["benchmark", benchmarkModels],
  ]);
  logSelectionSummary(
    [
      ["curated", curatedModels],
      ["top-day", topOpenRouterModels],
      ["benchmark", benchmarkModels],
    ],
    merged,
  );
  return merged.models;
}

export async function main(): Promise<void> {
  const { format } = parseArgs();
  const models = await selectPeriodicModels();

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
