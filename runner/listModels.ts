#!/usr/bin/env bun
/**
 * Output model names as JSON for use in CI workflows.
 * Keeps runner/models/index.ts as the single source of truth.
 *
 * Usage:
 *   bun run runner/listModels.ts --frequency daily --format json
 */
import { ALL_MODELS, type CIRunFrequency } from "./models/index.js";

function getModels(frequency?: CIRunFrequency): string[] {
  let models = ALL_MODELS;
  if (frequency) models = models.filter((m) => m.ciRunFrequency === frequency);
  return models.map((m) => m.name);
}

function parseArgs(): { frequency?: string; format: string } {
  const args = process.argv.slice(2);
  let frequency: string | undefined;
  let format = "json";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--frequency" && args[i + 1]) frequency = args[++i];
    if (args[i] === "--format" && args[i + 1]) format = args[++i];
  }

  return { frequency, format };
}

function main(): void {
  const { frequency, format } = parseArgs();

  const freq =
    frequency && frequency !== "all"
      ? (frequency as CIRunFrequency)
      : undefined;

  const models = getModels(freq);

  if (format === "json") {
    console.log(JSON.stringify(models));
  } else {
    console.log(models.join(","));
  }
}

main();
