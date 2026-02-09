#!/usr/bin/env bun
/**
 * Guideline ablation experiment runner.
 *
 * Runs a full set of evals (baseline + one ablation per top-level guideline
 * section) for a single model, then writes a combined summary JSON.
 *
 * Usage:
 *   bun run scripts/runAblation.ts --model gemini-2.5-flash
 *
 * Results are written to:
 *   ablation/results/<model>/<timestamp>.json
 */
import { mkdirSync, readdirSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { config } from "dotenv";
import { encode } from "gpt-tokenizer/encoding/cl100k_base";

import { MODELS_BY_NAME } from "../runner/models/index.js";
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

function parseArgs(): { model: string } {
  const args = process.argv.slice(2);
  let model = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--model" && args[i + 1]) {
      model = args[i + 1];
      i++;
    }
  }

  if (!model) {
    console.error("Usage: bun run scripts/runAblation.ts --model <model-name>");
    process.exit(1);
  }

  if (!MODELS_BY_NAME[model]) {
    console.error(`Model "${model}" not found. Available models:`);
    console.error(Object.keys(MODELS_BY_NAME).sort().join("\n"));
    process.exit(1);
  }

  return { model };
}

// ── Types ─────────────────────────────────────────────────────────────

interface AblationSectionResult {
  name: string;
  tokensInSection: number;
  verdict: "ESSENTIAL" | "MARGINAL" | "DISPENSABLE";
  regressions: string[];
  improvements: string[];
  score: { passed: number; failed: number };
}

interface AblationSummary {
  model: string;
  timestamp: string;
  baseline: {
    passed: number;
    failed: number;
    results: Array<{
      eval: string;
      passed: boolean;
      failure_reason: string | null;
    }>;
  };
  sections: AblationSectionResult[];
}

// ── Helpers ───────────────────────────────────────────────────────────

function resultsToMap(
  results: EvalIndividualResult[],
): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const r of results) {
    map.set(`${r.category}/${r.name}`, r.passed);
  }
  return map;
}

function computeDiffs(
  baseline: Map<string, boolean>,
  variant: Map<string, boolean>,
): { regressions: string[]; improvements: string[] } {
  const regressions: string[] = [];
  const improvements: string[] = [];

  for (const [evalName, baselinePassed] of baseline) {
    const variantPassed = variant.get(evalName);
    if (variantPassed === undefined) continue;

    if (baselinePassed && !variantPassed) {
      regressions.push(evalName);
    } else if (!baselinePassed && variantPassed) {
      improvements.push(evalName);
    }
  }

  return { regressions, improvements };
}

function countTokens(text: string): number {
  return encode(text).length;
}

// ── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { model: modelName } = parseArgs();

  // Step 1: Ensure ablation files exist
  console.log("Step 1: Generating ablation files...\n");
  const { execSync } = await import("child_process");
  execSync("bun run scripts/ablateGuidelines.ts", { stdio: "inherit" });

  // Step 2: Discover ablation variants
  const ablationDir = "ablation";
  const files = readdirSync(ablationDir)
    .filter((f) => f.endsWith(".md"))
    .sort();

  const baselineFile = files.find((f) => f === "full.md");
  const ablationFiles = files.filter(
    (f) => f.startsWith("without_") && f.endsWith(".md"),
  );

  if (!baselineFile) {
    console.error("No ablation/full.md found. Run ablateGuidelines.ts first.");
    process.exit(1);
  }

  console.log(
    `\nStep 2: Found ${ablationFiles.length} ablation variants + baseline\n`,
  );

  const modelTemplate = MODELS_BY_NAME[modelName];
  const tempBase = process.env.OUTPUT_TEMPDIR ??
    join(tmpdir(), `convex-ablation-${Date.now()}`);

  // Step 3: Run baseline
  console.log("━".repeat(60));
  console.log(`BASELINE: Running with full guidelines...`);
  console.log("━".repeat(60));

  const baselineConfig: RunConfig = {
    model: modelTemplate,
    tempdir: join(tempBase, "baseline"),
    customGuidelinesPath: join(ablationDir, baselineFile),
  };
  const baselineResults = await runEvalsForModel(baselineConfig);
  const baselineMap = resultsToMap(baselineResults);

  // Step 4: Run ablation variants
  const sectionResults: AblationSectionResult[] = [];

  for (let i = 0; i < ablationFiles.length; i++) {
    const file = ablationFiles[i];
    const sectionName = file.replace("without_", "").replace(".md", "");

    console.log("\n" + "━".repeat(60));
    console.log(
      `ABLATION ${i + 1}/${ablationFiles.length}: without ${sectionName}`,
    );
    console.log("━".repeat(60));

    const variantConfig: RunConfig = {
      model: modelTemplate,
      tempdir: join(tempBase, `without_${sectionName}`),
      customGuidelinesPath: join(ablationDir, file),
    };

    const variantResults = await runEvalsForModel(variantConfig);
    const variantMap = resultsToMap(variantResults);
    const { regressions, improvements } = computeDiffs(
      baselineMap,
      variantMap,
    );

    // Estimate tokens in the removed section by diffing full vs variant
    const { readFileSync } = await import("fs");
    const fullContent = readFileSync(
      join(ablationDir, baselineFile),
      "utf-8",
    );
    const variantContent = readFileSync(join(ablationDir, file), "utf-8");
    const tokensInSection =
      countTokens(fullContent) - countTokens(variantContent);

    const passed = variantResults.filter((r) => r.passed).length;
    const failed = variantResults.length - passed;

    let verdict: "ESSENTIAL" | "MARGINAL" | "DISPENSABLE";
    if (regressions.length >= 2) {
      verdict = "ESSENTIAL";
    } else if (regressions.length === 1) {
      verdict = "MARGINAL";
    } else {
      verdict = "DISPENSABLE";
    }

    sectionResults.push({
      name: sectionName,
      tokensInSection,
      verdict,
      regressions,
      improvements,
      score: { passed, failed },
    });

    console.log(
      `\n  → ${verdict}: ${regressions.length} regressions, ${improvements.length} improvements`,
    );
    if (regressions.length > 0) {
      console.log(`    Regressions: ${regressions.join(", ")}`);
    }
    if (improvements.length > 0) {
      console.log(`    Improvements: ${improvements.join(", ")}`);
    }
  }

  // Step 5: Write summary
  const baselinePassed = baselineResults.filter((r) => r.passed).length;
  const baselineFailed = baselineResults.length - baselinePassed;

  const summary: AblationSummary = {
    model: modelName,
    timestamp: new Date().toISOString(),
    baseline: {
      passed: baselinePassed,
      failed: baselineFailed,
      results: baselineResults.map((r) => ({
        eval: `${r.category}/${r.name}`,
        passed: r.passed,
        failure_reason: r.failure_reason,
      })),
    },
    sections: sectionResults,
  };

  const resultsDir = join(ablationDir, "results", modelName);
  mkdirSync(resultsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outputPath = join(resultsDir, `${timestamp}.json`);
  writeFileSync(outputPath, JSON.stringify(summary, null, 2));

  // Step 6: Print final summary
  console.log("\n\n" + "═".repeat(60));
  console.log("ABLATION EXPERIMENT COMPLETE");
  console.log("═".repeat(60));
  console.log(`Model: ${modelName}`);
  console.log(`Baseline: ${baselinePassed}/${baselineResults.length} passed`);
  console.log(`Results written to: ${outputPath}\n`);

  console.log(
    `${"Section".padEnd(35)} | ${"Verdict".padEnd(12)} | ${"Regr".padStart(4)} | ${"Impr".padStart(4)} | ${"Tokens".padStart(6)} | Score`,
  );
  console.log("-".repeat(90));

  for (const s of sectionResults) {
    console.log(
      `${s.name.padEnd(35)} | ${s.verdict.padEnd(12)} | ${String(s.regressions.length).padStart(4)} | ${String(s.improvements.length).padStart(4)} | ${String(s.tokensInSection).padStart(6)} | ${s.score.passed}/${s.score.passed + s.score.failed}`,
    );
  }

  const essentialTokens = sectionResults
    .filter((s) => s.verdict !== "DISPENSABLE")
    .reduce((sum, s) => sum + s.tokensInSection, 0);
  const dispensableTokens = sectionResults
    .filter((s) => s.verdict === "DISPENSABLE")
    .reduce((sum, s) => sum + s.tokensInSection, 0);

  console.log(`\nToken budget summary:`);
  console.log(`  Essential/Marginal sections: ~${essentialTokens} tokens`);
  console.log(`  Dispensable sections:        ~${dispensableTokens} tokens (can be removed)`);

  await closeClient();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
