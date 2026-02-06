#!/usr/bin/env bun
/**
 * Main evaluation orchestrator.
 * Replaces the Python Braintrust Eval() framework with a simple async loop.
 *
 * Usage:
 *   bun run runner/index.ts
 *
 * Environment variables:
 *   MODELS           - comma-separated model names (default: see below)
 *   TEST_FILTER      - regex to filter evals by "category/name"
 *   OUTPUT_TEMPDIR   - output directory (default: OS temp dir)
 *   LOCAL_RESULTS    - path to JSONL results file
 *   POST_TO_CONVEX   - set to "1" to post scores to Convex
 *   EVALS_EXPERIMENT - experiment name (e.g. "no_guidelines")
 *   CONVEX_EVAL_URL  - Convex deployment URL (e.g. "https://xxx.convex.cloud")
 *   CONVEX_AUTH_TOKEN - auth token for the evalScores Convex backend
 */
import { readdirSync, readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { config } from "dotenv";

import {
  MODELS_BY_NAME,
  type ModelTemplate,
  getApiKeyEnvVar,
} from "./models/index.js";
import { Model } from "./models/modelCodegen.js";
import { convexScorer, walkAnswer } from "./scorer.js";
import {
  startRun,
  completeRun,
  startEval,
  getOrUploadEvalSource,
  writeLocalResults,
  printEvalSummary,
  closeClient,
  type EvalIndividualResult,
} from "./reporting.js";
import { logInfo } from "./logging.js";

config(); // Load .env

// ── Configuration ─────────────────────────────────────────────────────

const tempdir = process.env.OUTPUT_TEMPDIR ?? join(tmpdir(), `convex-evals-${Date.now()}`);
logInfo(`Using tempdir: ${tempdir}`);

const testFilter = process.env.TEST_FILTER
  ? new RegExp(process.env.TEST_FILTER)
  : null;

const CONVEX_EVAL_URL = process.env.CONVEX_EVAL_URL;
const CONVEX_AUTH_TOKEN = process.env.CONVEX_AUTH_TOKEN;

// ── Default models ────────────────────────────────────────────────────

const DEFAULT_MODEL_NAMES = [
  "claude-3-5-sonnet-latest",
  "claude-3-7-sonnet-latest",
  "claude-sonnet-4-0",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
  "claude-opus-4-5",
  "gpt-4o",
  "o3-mini",
  "gemini-2.0-flash-lite",
  "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
  "gemini-3-pro-preview",
  "grok-3-mini-beta",
];

// ── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const modelNames = process.env.MODELS
    ? process.env.MODELS.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_MODEL_NAMES;

  for (const modelName of modelNames) {
    if (!MODELS_BY_NAME[modelName]) {
      console.error(`Model ${modelName} not supported`);
      process.exit(1);
    }
  }

  for (const modelName of modelNames) {
    const model = MODELS_BY_NAME[modelName];
    await runEvalsForModel(model);
  }

  await closeClient();
}

async function runEvalsForModel(model: ModelTemplate): Promise<void> {
  // Discover evals
  const evalPaths = discoverEvals();
  const filteredPaths = evalPaths.filter(
    ({ category, name }) =>
      !testFilter || testFilter.test(`${category}/${name}`),
  );

  logInfo(
    `Running ${filteredPaths.length} evals for model ${model.formattedName}`,
  );

  // Start run if Convex is configured
  let runId: string | null = null;
  const runStartTime = Date.now();

  if (CONVEX_EVAL_URL && CONVEX_AUTH_TOKEN) {
    const plannedEvals = filteredPaths.map((e) => `${e.category}/${e.name}`);
    const experiment = process.env.EVALS_EXPERIMENT;
    runId = await startRun(
      model.name,
      plannedEvals,
      model.provider,
      experiment,
    );
    if (runId) {
      logInfo(
        `Started run ${runId} for model ${model.name} with ${plannedEvals.length} evals`,
      );
    } else {
      logInfo(
        "Failed to start run in Convex (endpoint may not be configured)",
      );
    }
  }

  // Get API key
  const apiKeyVar = getApiKeyEnvVar(model.provider);
  const apiKey = process.env[apiKeyVar];
  if (!apiKey) {
    console.error(`${apiKeyVar} is not set`);
    process.exit(1);
  }

  const modelImpl = new Model(apiKey, model);
  const allResults: EvalIndividualResult[] = [];

  // Process evals with concurrency control
  const concurrency = model.maxConcurrency;
  const queue = [...filteredPaths];
  const inFlight = new Set<Promise<void>>();

  while (queue.length > 0 || inFlight.size > 0) {
    while (queue.length > 0 && inFlight.size < concurrency) {
      const evalInfo = queue.shift()!;
      const promise = processOneEval(
        model,
        modelImpl,
        evalInfo,
        runId,
        allResults,
        filteredPaths.length,
      ).finally(() => inFlight.delete(promise));
      inFlight.add(promise);
    }
    if (inFlight.size > 0) {
      await Promise.race(inFlight);
    }
  }

  // Write local results and print summary
  writeLocalResults(model.name, model.formattedName, tempdir, allResults);
  printEvalSummary(model.formattedName, allResults);

  // Complete run
  if (runId) {
    const runDuration = Date.now() - runStartTime;
    await completeRun(runId, { kind: "completed", durationMs: runDuration });
    logInfo(`Completed run ${runId}`);
  }
}

async function processOneEval(
  model: ModelTemplate,
  modelImpl: Model,
  evalInfo: { category: string; name: string; evalPath: string },
  runId: string | null,
  allResults: EvalIndividualResult[],
  totalEvals: number,
): Promise<void> {
  const { category, name, evalPath } = evalInfo;
  const evalPathStr = `${category}/${name}`;

  logInfo(`[${evalPathStr}] Calling model ${model.formattedName}...`);

  // Read task description
  const taskDescription = readFileSync(
    join(evalPath, "TASK.txt"),
    "utf-8",
  );

  // Read expected files
  const answerPaths = [...walkAnswer(join(evalPath, "answer"))].sort(
    (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
  );
  const expected: Record<string, string> = {};
  for (const filePath of answerPaths) {
    const basePath = join(evalPath, "answer");
    const relativePath = filePath
      .slice(basePath.length + 1)
      .replace(/\\/g, "/");
    expected[relativePath] = readFileSync(filePath, "utf-8").trim();
  }

  // Start eval in Convex if available
  let evalId: string | null = null;
  if (runId) {
    const { taskContent, storageId } = await getOrUploadEvalSource(evalPath);
    evalId = await startEval(
      runId,
      evalPathStr,
      category,
      name,
      taskContent ?? undefined,
      storageId ?? undefined,
    );
  }

  const metadata = {
    name: evalPathStr,
    category,
    eval_name: name,
    model: model.name,
    model_name: model.formattedName,
    tempdir,
    eval_id: evalId,
    run_id: runId,
  };

  const evalStartTime = Date.now();

  try {
    // Call the model
    const output = await modelImpl.generate(taskDescription);
    const generateDuration = ((Date.now() - evalStartTime) / 1000).toFixed(1);
    logInfo(`[${evalPathStr}] Model responded (${generateDuration}s), scoring...`);

    // Score
    const scores = await convexScorer(
      tempdir,
      taskDescription,
      expected,
      metadata,
      output,
    );

    // Convert scores to individual result
    const scoresMap: Record<string, number> = {};
    for (const s of scores) {
      scoresMap[s.name] = s.score;
    }

    const testsPassScore = scoresMap["Tests pass"] ?? 0;
    const passed = testsPassScore >= 1;
    let failureReason: string | null = null;

    if (!passed) {
      // Find first failing score
      for (const s of scores) {
        if (s.score < 1) {
          if (s.name === "Valid filesystem output") failureReason = "filesystem fail";
          else if (s.name === "`bun install` succeeds") failureReason = "install fail";
          else if (s.name === "`convex dev` succeeds") failureReason = "convex dev fail";
          else if (s.name === "Passes tsc") failureReason = "tsc fail";
          else if (s.name === "Passes eslint") failureReason = "eslint fail";
          else if (s.name === "Tests pass") failureReason = "tests fail";
          if (failureReason) break;
        }
      }
      if (!failureReason) failureReason = "unknown fail";
    }

    const dirPath = join(
      tempdir,
      "output",
      model.name,
      category,
      name,
    );

    allResults.push({
      category,
      name,
      passed,
      tests_pass_score: testsPassScore,
      failure_reason: failureReason,
      directory_path: dirPath,
      scores: scoresMap,
    });

    // Log result and running progress
    const totalDuration = ((Date.now() - evalStartTime) / 1000).toFixed(1);
    const status = passed ? "PASS" : "FAIL";
    const reason = passed ? "" : ` (${failureReason})`;
    const completed = allResults.length;
    const passedCount = allResults.filter((r) => r.passed).length;
    const failedCount = completed - passedCount;
    const pct = ((completed / totalEvals) * 100).toFixed(0);
    logInfo(
      `[${evalPathStr}] ${status}${reason} (${totalDuration}s) | Progress: ${completed}/${totalEvals} (${pct}%) - ${passedCount} passed, ${failedCount} failed`,
    );
  } catch (e) {
    console.error(`[${evalPathStr}] ERROR: ${String(e)}`);
    allResults.push({
      category,
      name,
      passed: false,
      tests_pass_score: 0,
      failure_reason: `error: ${String(e)}`,
      directory_path: null,
      scores: {},
    });

    // Log error and running progress
    const completed = allResults.length;
    const passedCount = allResults.filter((r) => r.passed).length;
    const failedCount = completed - passedCount;
    const pct = ((completed / totalEvals) * 100).toFixed(0);
    logInfo(
      `[${evalPathStr}] FAIL (error) | Progress: ${completed}/${totalEvals} (${pct}%) - ${passedCount} passed, ${failedCount} failed`,
    );
  }
}

function discoverEvals(): Array<{
  category: string;
  name: string;
  evalPath: string;
}> {
  const evalsDir = "evals";
  if (!existsSync(evalsDir)) return [];

  const results: Array<{ category: string; name: string; evalPath: string }> =
    [];
  const categories = readdirSync(evalsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const category of categories) {
    const categoryPath = join(evalsDir, category.name);
    const evalDirs = readdirSync(categoryPath, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const evalDir of evalDirs) {
      const evalPath = join(categoryPath, evalDir.name);
      if (existsSync(join(evalPath, "TASK.txt"))) {
        results.push({
          category: category.name,
          name: evalDir.name,
          evalPath,
        });
      }
    }
  }
  return results;
}

// ── Run ───────────────────────────────────────────────────────────────

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
