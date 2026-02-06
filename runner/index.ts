#!/usr/bin/env bun
/**
 * Main evaluation orchestrator.
 *
 * Usage:
 *   bun run runner/index.ts
 *
 * Environment variables:
 *   MODELS           - comma-separated model names (default: see below)
 *   TEST_FILTER      - regex to filter evals by "category/name"
 *   OUTPUT_TEMPDIR   - output directory (default: OS temp dir)
 *   EVALS_EXPERIMENT - experiment name (e.g. "no_guidelines")
 *   CONVEX_EVAL_URL  - Convex deployment URL (e.g. "https://xxx.convex.cloud")
 *   CONVEX_AUTH_TOKEN - auth token for the Convex backend
 */
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
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
  printEvalSummary,
  closeClient,
  type EvalIndividualResult,
} from "./reporting.js";
import { logInfo } from "./logging.js";

config(); // Load .env

// ── Configuration ─────────────────────────────────────────────────────

const tempdir =
  process.env.OUTPUT_TEMPDIR ?? join(tmpdir(), `convex-evals-${Date.now()}`);
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

// ── Eval discovery ────────────────────────────────────────────────────

interface EvalInfo {
  category: string;
  name: string;
  evalPath: string;
}

function discoverEvals(): EvalInfo[] {
  const evalsDir = "evals";
  if (!existsSync(evalsDir)) return [];

  const results: EvalInfo[] = [];
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

// ── Score name to failure reason mapping ──────────────────────────────

const SCORE_FAILURE_REASONS: Record<string, string> = {
  "Valid filesystem output": "filesystem fail",
  "`bun install` succeeds": "install fail",
  "`convex dev` succeeds": "convex dev fail",
  "Passes tsc": "tsc fail",
  "Passes eslint": "eslint fail",
  "Tests pass": "tests fail",
};

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
    await runEvalsForModel(MODELS_BY_NAME[modelName]);
  }

  await closeClient();
}

async function runEvalsForModel(model: ModelTemplate): Promise<void> {
  const evalPaths = discoverEvals();
  const filteredPaths = testFilter
    ? evalPaths.filter(({ category, name }) =>
        testFilter.test(`${category}/${name}`),
      )
    : evalPaths;

  logInfo(
    `Running ${filteredPaths.length} evals for model ${model.formattedName}`,
  );

  // Start run if Convex is configured
  let runId: string | null = null;
  const runStartTime = Date.now();

  if (CONVEX_EVAL_URL && CONVEX_AUTH_TOKEN) {
    const plannedEvals = filteredPaths.map((e) => `${e.category}/${e.name}`);
    runId = await startRun(
      model.name,
      model.formattedName,
      plannedEvals,
      model.provider,
      process.env.EVALS_EXPERIMENT,
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
  const queue = [...filteredPaths];
  const inFlight = new Set<Promise<void>>();

  while (queue.length > 0 || inFlight.size > 0) {
    while (queue.length > 0 && inFlight.size < model.maxConcurrency) {
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

  // Print summary
  printEvalSummary(model.formattedName, allResults);

  // Complete run
  if (runId) {
    await completeRun(runId, {
      kind: "completed",
      durationMs: Date.now() - runStartTime,
    });
    logInfo(`Completed run ${runId}`);
  }
}

async function processOneEval(
  model: ModelTemplate,
  modelImpl: Model,
  evalInfo: EvalInfo,
  runId: string | null,
  allResults: EvalIndividualResult[],
  totalEvals: number,
): Promise<void> {
  const { category, name, evalPath } = evalInfo;
  const evalPathStr = `${category}/${name}`;

  logInfo(`[${evalPathStr}] Calling model ${model.formattedName}...`);

  // Read task description and expected files
  const taskDescription = readFileSync(join(evalPath, "TASK.txt"), "utf-8");
  const expected = readExpectedFiles(evalPath);

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
    const output = await modelImpl.generate(taskDescription);
    const generateDuration = ((Date.now() - evalStartTime) / 1000).toFixed(1);
    logInfo(
      `[${evalPathStr}] Model responded (${generateDuration}s), scoring...`,
    );

    const scores = await convexScorer(
      tempdir,
      taskDescription,
      expected,
      metadata,
      output,
    );

    const result = buildEvalResult(category, name, model.name, scores);
    allResults.push(result);
    logProgress(evalPathStr, result, allResults, totalEvals, evalStartTime);
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
    logProgress(
      evalPathStr,
      allResults[allResults.length - 1],
      allResults,
      totalEvals,
      evalStartTime,
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function readExpectedFiles(evalPath: string): Record<string, string> {
  const answerPaths = [...walkAnswer(join(evalPath, "answer"))].sort(
    (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
  );
  const expected: Record<string, string> = {};
  const basePath = join(evalPath, "answer");
  for (const filePath of answerPaths) {
    const relativePath = filePath
      .slice(basePath.length + 1)
      .replace(/\\/g, "/");
    expected[relativePath] = readFileSync(filePath, "utf-8").trim();
  }
  return expected;
}

function buildEvalResult(
  category: string,
  name: string,
  modelName: string,
  scores: Array<{ name: string; score: number }>,
): EvalIndividualResult {
  const scoresMap: Record<string, number> = {};
  for (const s of scores) {
    scoresMap[s.name] = s.score;
  }

  const testsPassScore = scoresMap["Tests pass"] ?? 0;
  const passed = testsPassScore >= 1;

  let failureReason: string | null = null;
  if (!passed) {
    for (const s of scores) {
      if (s.score < 1 && SCORE_FAILURE_REASONS[s.name]) {
        failureReason = SCORE_FAILURE_REASONS[s.name];
        break;
      }
    }
    failureReason ??= "unknown fail";
  }

  return {
    category,
    name,
    passed,
    tests_pass_score: testsPassScore,
    failure_reason: failureReason,
    directory_path: join(tempdir, "output", modelName, category, name),
    scores: scoresMap,
  };
}

function logProgress(
  evalPathStr: string,
  result: EvalIndividualResult,
  allResults: EvalIndividualResult[],
  totalEvals: number,
  evalStartTime: number,
): void {
  const totalDuration = ((Date.now() - evalStartTime) / 1000).toFixed(1);
  const status = result.passed ? "PASS" : "FAIL";
  const reason = result.passed ? "" : ` (${result.failure_reason})`;
  const completed = allResults.length;
  const passedCount = allResults.filter((r) => r.passed).length;
  const failedCount = completed - passedCount;
  const pct = ((completed / totalEvals) * 100).toFixed(0);

  logInfo(
    `[${evalPathStr}] ${status}${reason} (${totalDuration}s) | Progress: ${completed}/${totalEvals} (${pct}%) - ${passedCount} passed, ${failedCount} failed`,
  );
}

// ── Run ───────────────────────────────────────────────────────────────

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
