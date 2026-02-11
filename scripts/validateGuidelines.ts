#!/usr/bin/env bun
/**
 * Guideline change validation: run evals with "before" vs "after" guidelines
 * across multiple models and report pass/fail deltas.
 *
 * Usage:
 *   bun run scripts/validateGuidelines.ts --before <path> --after <path> --models <model1,model2,...> [--filter <regex>] [--output <path>]
 *
 * Does not set CONVEX_EVAL_URL so results stay local.
 */
import { mkdirSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Command } from "commander";
import { config } from "dotenv";

import { MODELS_BY_NAME, getApiKeyEnvVar } from "../runner/models/index.js";
import {
  runEvalsForModel,
  type RunConfig,
} from "../runner/index.js";
import {
  closeClient,
  type EvalIndividualResult,
} from "../runner/reporting.js";

config(); // Load .env

// ── Argument parsing ──────────────────────────────────────────────────

function parseArgs(): {
  before: string;
  after: string;
  models: string[];
  filter: string | null;
  output: string | null;
} {
  const program = new Command()
    .name("validateGuidelines")
    .description(
      "Run before/after guideline eval comparisons across multiple models",
    )
    .requiredOption(
      "--before <path>",
      "Path to the baseline guidelines markdown file",
    )
    .requiredOption(
      "--after <path>",
      "Path to the proposed guidelines markdown file",
    )
    .requiredOption(
      "--models <model1,model2,...>",
      "Comma-separated model names",
      (value: string) =>
        value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
    )
    .option(
      "--filter <regex>",
      "Optional regex to filter evals by category/name",
    )
    .option("--output <path>", "Optional output path for JSON summary")
    .showHelpAfterError();

  program.parse(process.argv);
  const opts = program.opts<{
    before: string;
    after: string;
    models: string[];
    filter?: string;
    output?: string;
  }>();

  const models = opts.models;
  if (models.length === 0) {
    console.error("No models specified.");
    process.exit(1);
  }

  for (const m of models) {
    if (!MODELS_BY_NAME[m]) {
      console.error(`Model "${m}" not found. Available: ${Object.keys(MODELS_BY_NAME).sort().join(", ")}`);
      process.exit(1);
    }
  }

  return {
    before: opts.before,
    after: opts.after,
    models,
    filter: opts.filter ?? null,
    output: opts.output ?? null,
  };
}

// ── Types ─────────────────────────────────────────────────────────────

interface ModelComparison {
  model: string;
  before: { passed: number; failed: number; results: Array<{ eval: string; passed: boolean; failure_reason: string | null }> };
  after: { passed: number; failed: number; results: Array<{ eval: string; passed: boolean; failure_reason: string | null }> };
  delta: number;
  regressions: string[];
  improvements: string[];
}

interface ValidationSummary {
  timestamp: string;
  beforePath: string;
  afterPath: string;
  filter: string | null;
  models: ModelComparison[];
  anyRegressions: boolean;
  totalRegressions: number;
  totalImprovements: number;
}

// ── Helpers ───────────────────────────────────────────────────────────

function resultsToMap(results: EvalIndividualResult[]): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const r of results) {
    map.set(`${r.category}/${r.name}`, r.passed);
  }
  return map;
}

function computeDiffs(
  beforeMap: Map<string, boolean>,
  afterMap: Map<string, boolean>,
): { regressions: string[]; improvements: string[] } {
  const regressions: string[] = [];
  const improvements: string[] = [];

  for (const [evalName, beforePassed] of beforeMap) {
    const afterPassed = afterMap.get(evalName);
    if (afterPassed === undefined) continue;

    if (beforePassed && !afterPassed) {
      regressions.push(evalName);
    } else if (!beforePassed && afterPassed) {
      improvements.push(evalName);
    }
  }

  return { regressions, improvements };
}

// ── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { before, after, models, filter, output } = parseArgs();

  if (!existsSync(before)) {
    console.error(`Before file not found: ${before}`);
    process.exit(1);
  }
  if (!existsSync(after)) {
    console.error(`After file not found: ${after}`);
    process.exit(1);
  }

  // Ensure we do not report to Convex (local-only validation)
  const prevUrl = process.env.CONVEX_EVAL_URL;
  const prevToken = process.env.CONVEX_AUTH_TOKEN;
  delete process.env.CONVEX_EVAL_URL;
  delete process.env.CONVEX_AUTH_TOKEN;

  const tempBase =
    process.env.OUTPUT_TEMPDIR ?? join(tmpdir(), `convex-validate-guidelines-${Date.now()}`);

  const testFilter = filter ? new RegExp(filter) : undefined;

  const comparisons: ModelComparison[] = [];

  for (const modelName of models) {
    const apiKeyVar = getApiKeyEnvVar(MODELS_BY_NAME[modelName].provider);
    if (!process.env[apiKeyVar]) {
      console.warn(`Skipping ${modelName}: ${apiKeyVar} not set`);
      continue;
    }

    console.log("\n" + "━".repeat(60));
    console.log(`Model: ${modelName} — BEFORE (current guidelines)`);
    console.log("━".repeat(60));

    const beforeConfig: RunConfig = {
      model: MODELS_BY_NAME[modelName],
      tempdir: join(tempBase, modelName.replace(/\//g, "_"), "before"),
      testFilter,
      customGuidelinesPath: before,
    };
    const beforeResults = await runEvalsForModel(beforeConfig);
    const beforeMap = resultsToMap(beforeResults);
    const beforePassed = beforeResults.filter((r) => r.passed).length;
    const beforeFailed = beforeResults.length - beforePassed;

    console.log("\n" + "━".repeat(60));
    console.log(`Model: ${modelName} — AFTER (proposed guidelines)`);
    console.log("━".repeat(60));

    const afterConfig: RunConfig = {
      model: MODELS_BY_NAME[modelName],
      tempdir: join(tempBase, modelName.replace(/\//g, "_"), "after"),
      testFilter,
      customGuidelinesPath: after,
    };
    const afterResults = await runEvalsForModel(afterConfig);
    const afterMap = resultsToMap(afterResults);
    const afterPassed = afterResults.filter((r) => r.passed).length;
    const afterFailed = afterResults.length - afterPassed;

    const { regressions, improvements } = computeDiffs(beforeMap, afterMap);
    const delta = afterPassed - beforePassed;

    comparisons.push({
      model: modelName,
      before: {
        passed: beforePassed,
        failed: beforeFailed,
        results: beforeResults.map((r) => ({
          eval: `${r.category}/${r.name}`,
          passed: r.passed,
          failure_reason: r.failure_reason,
        })),
      },
      after: {
        passed: afterPassed,
        failed: afterFailed,
        results: afterResults.map((r) => ({
          eval: `${r.category}/${r.name}`,
          passed: r.passed,
          failure_reason: r.failure_reason,
        })),
      },
      delta,
      regressions,
      improvements,
    });
  }

  // Restore Convex env for any downstream use
  if (prevUrl !== undefined) process.env.CONVEX_EVAL_URL = prevUrl;
  if (prevToken !== undefined) process.env.CONVEX_AUTH_TOKEN = prevToken;

  const anyRegressions = comparisons.some((c) => c.regressions.length > 0);
  const totalRegressions = comparisons.reduce((s, c) => s + c.regressions.length, 0);
  const totalImprovements = comparisons.reduce((s, c) => s + c.improvements.length, 0);

  const summary: ValidationSummary = {
    timestamp: new Date().toISOString(),
    beforePath: before,
    afterPath: after,
    filter,
    models: comparisons,
    anyRegressions,
    totalRegressions,
    totalImprovements,
  };

  // Write JSON
  const outputPath =
    output ??
    join(
      "guideline-validation",
      "results",
      `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`,
    );
  const outDir = join(outputPath, "..");
  if (outDir !== ".") mkdirSync(outDir, { recursive: true });
  writeFileSync(outputPath, JSON.stringify(summary, null, 2));
  console.log(`\nResults written to: ${outputPath}`);

  // Print comparison table
  console.log("\n\n" + "═".repeat(70));
  console.log("GUIDELINE VALIDATION SUMMARY");
  console.log("═".repeat(70));
  console.log(`Before: ${before}`);
  console.log(`After:  ${after}`);
  if (filter) console.log(`Filter:  ${filter}`);
  console.log("");

  const header = "Model".padEnd(28) + " | Before   | After    | Delta  | Regressions | Improvements";
  console.log(header);
  console.log("-".repeat(header.length));

  for (const c of comparisons) {
    const deltaStr = c.delta >= 0 ? `+${c.delta}` : String(c.delta);
    console.log(
      `${c.model.padEnd(28)} | ${String(c.before.passed + "/" + (c.before.passed + c.before.failed)).padEnd(8)} | ${String(c.after.passed + "/" + (c.after.passed + c.after.failed)).padEnd(8)} | ${deltaStr.padStart(6)} | ${String(c.regressions.length).padStart(11)} | ${c.improvements.length}`,
    );
  }

  console.log("");
  if (anyRegressions) {
    console.log("Regressions (eval passed before, failed after):");
    for (const c of comparisons) {
      if (c.regressions.length > 0) {
        console.log(`  ${c.model}: ${c.regressions.join(", ")}`);
      }
    }
    console.log("");
  }
  if (totalImprovements > 0) {
    console.log("Improvements (eval failed before, passed after):");
    for (const c of comparisons) {
      if (c.improvements.length > 0) {
        console.log(`  ${c.model}: ${c.improvements.join(", ")}`);
      }
    }
    console.log("");
  }

  console.log("═".repeat(70));
  if (anyRegressions) {
    console.log("Verdict: REGRESSIONS DETECTED — consider reverting or narrowing the guideline change.");
  } else if (totalImprovements > 0) {
    console.log("Verdict: No regressions; improvements observed. Safe to commit.");
  } else {
    console.log("Verdict: No regressions; no change in pass counts. Safe to commit.");
  }
  console.log("═".repeat(70));

  await closeClient();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
