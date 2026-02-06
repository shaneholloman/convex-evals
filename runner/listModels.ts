#!/usr/bin/env bun
/**
 * Output model names as JSON for use in CI workflows.
 * Keeps runner/models/index.ts as the single source of truth.
 *
 * Usage:
 *   bun run runner/listModels.ts --frequency daily --format json
 */
import {
  ALL_MODELS,
  ModelProvider,
  type CIRunFrequency,
} from "./models/index.js";

function getModels(
  provider?: ModelProvider,
  frequency?: CIRunFrequency,
): string[] {
  let models = ALL_MODELS;
  if (provider) models = models.filter((m) => m.provider === provider);
  if (frequency) models = models.filter((m) => m.ciRunFrequency === frequency);
  return models.map((m) => m.name);
}

function parseArgs(): {
  provider?: string;
  frequency?: string;
  format: string;
} {
  const args = process.argv.slice(2);
  let provider: string | undefined;
  let frequency: string | undefined;
  let format = "json";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--provider" && args[i + 1]) provider = args[++i];
    if (args[i] === "--frequency" && args[i + 1]) frequency = args[++i];
    if (args[i] === "--format" && args[i + 1]) format = args[++i];
  }

  return { provider, frequency, format };
}

function resolveProvider(input?: string): ModelProvider | undefined {
  if (!input || input === "all") return undefined;

  // Try enum key (e.g. "ANTHROPIC")
  const byKey = (ModelProvider as Record<string, ModelProvider>)[
    input.toUpperCase()
  ];
  if (byKey) return byKey;

  // Try enum value (e.g. "anthropic")
  const byValue = Object.values(ModelProvider).find(
    (v) => v === (input as ModelProvider),
  );
  return byValue as ModelProvider | undefined;
}

function main(): void {
  const { provider, frequency, format } = parseArgs();

  const providerEnum = resolveProvider(provider);
  const freq =
    frequency && frequency !== "all"
      ? (frequency as CIRunFrequency)
      : undefined;

  const models = getModels(providerEnum, freq);

  if (format === "json") {
    console.log(JSON.stringify(models));
  } else {
    console.log(models.join(","));
  }
}

main();
