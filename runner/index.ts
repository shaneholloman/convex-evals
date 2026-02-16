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
 *   CUSTOM_GUIDELINES_PATH - path to custom guidelines markdown file
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
  completeEval,
  getOrUploadEvalSource,
  printEvalSummary,
  closeClient,
  type EvalIndividualResult,
} from "./reporting.js";
import { logInfo } from "./logging.js";

config(); // Load .env

// ── Run configuration ─────────────────────────────────────────────────

/**
 * Configuration for a single eval run. Can be constructed from env vars
 * (via `configFromEnv()`) or programmatically for use by scripts like
 * the ablation runner.
 */
export interface RunConfig {
  model: ModelTemplate;
  tempdir: string;
  testFilter?: RegExp;
  customGuidelinesPath?: string;
  convexEvalUrl?: string;
  convexAuthToken?: string;
  experiment?: string;
}

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

// ── Main (CLI entrypoint) ─────────────────────────────────────────────

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

  const td =
    process.env.OUTPUT_TEMPDIR ?? join(tmpdir(), `convex-evals-${Date.now()}`);
  logInfo(`Using tempdir: ${td}`);

  const tf = process.env.TEST_FILTER
    ? new RegExp(process.env.TEST_FILTER)
    : undefined;

  for (const modelName of modelNames) {
    const cfg: RunConfig = {
      model: MODELS_BY_NAME[modelName],
      tempdir: td,
      testFilter: tf,
      customGuidelinesPath: process.env.CUSTOM_GUIDELINES_PATH,
      convexEvalUrl: process.env.CONVEX_EVAL_URL,
      convexAuthToken: process.env.CONVEX_AUTH_TOKEN,
      experiment: process.env.EVALS_EXPERIMENT,
    };
    await runEvalsForModel(cfg);
  }

  await closeClient();

  // Force-exit: the ConvexClient WebSocket and fire-and-forget recordStep
  // promises can keep the event loop alive after all work is done, causing
  // CI jobs to hang until they hit the GitHub Actions timeout.
  process.exit(0);
}

/**
 * Run all evals for a single model and return per-eval results.
 *
 * Can be called programmatically (e.g. from the ablation runner) or
 * via the CLI entrypoint above.
 */
export async function runEvalsForModel(
  config: RunConfig,
): Promise<EvalIndividualResult[]> {
  const { model, tempdir, testFilter, convexEvalUrl, convexAuthToken } =
    config;

  // Set CUSTOM_GUIDELINES_PATH so getGuidelinesContent() in modelCodegen
  // picks it up. We restore it afterwards to avoid cross-run leakage.
  const prevGuidelinesPath = process.env.CUSTOM_GUIDELINES_PATH;
  if (config.customGuidelinesPath) {
    process.env.CUSTOM_GUIDELINES_PATH = config.customGuidelinesPath;
  } else {
    delete process.env.CUSTOM_GUIDELINES_PATH;
  }

  // Similarly for EVALS_EXPERIMENT
  const prevExperiment = process.env.EVALS_EXPERIMENT;
  if (config.experiment) {
    process.env.EVALS_EXPERIMENT = config.experiment;
  } else {
    delete process.env.EVALS_EXPERIMENT;
  }

  try {
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

    if (convexEvalUrl && convexAuthToken) {
      const plannedEvals = filteredPaths.map(
        (e) => `${e.category}/${e.name}`,
      );
      runId = await startRun(
        model.name,
        model.formattedName,
        plannedEvals,
        model.provider,
        config.experiment,
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
    let rateLimitCount = 0;
    const RATE_LIMIT_ABORT_THRESHOLD = 3;

    // Process evals with concurrency control
    const queue = [...filteredPaths];
    const inFlight = new Set<Promise<void>>();

    while (queue.length > 0 || inFlight.size > 0) {
      // Abort early if we've hit too many rate-limit errors
      if (rateLimitCount >= RATE_LIMIT_ABORT_THRESHOLD) {
        // Drain remaining queue — don't start new evals
        if (queue.length > 0) {
          logInfo(
            `Aborting run: ${rateLimitCount} rate-limit errors exceeded threshold (${RATE_LIMIT_ABORT_THRESHOLD}). Skipping ${queue.length} remaining eval(s).`,
          );
          queue.length = 0;
        }
        // Wait for in-flight evals to finish, but don't start new ones
        if (inFlight.size > 0) {
          await Promise.race(inFlight);
          continue;
        }
        break;
      }

      while (queue.length > 0 && inFlight.size < model.maxConcurrency) {
        const evalInfo = queue.shift()!;
        const promise = processOneEval(
          model,
          modelImpl,
          evalInfo,
          runId,
          allResults,
          filteredPaths.length,
          tempdir,
        ).then((wasRateLimited) => {
          if (wasRateLimited) rateLimitCount++;
        }).finally(() => inFlight.delete(promise));
        inFlight.add(promise);
      }
      if (inFlight.size > 0) {
        await Promise.race(inFlight);
      }
    }

    // Print summary
    printEvalSummary(model.formattedName, allResults);

    // If we aborted due to rate limits, fail the run so it doesn't
    // appear on the leaderboard with partial (misleading) results.
    if (rateLimitCount >= RATE_LIMIT_ABORT_THRESHOLD) {
      if (runId) {
        await completeRun(runId, {
          kind: "failed",
          failureReason: `[rate_limit] Aborted after ${rateLimitCount} rate-limit errors`,
          durationMs: Date.now() - runStartTime,
        });
        logInfo(
          `Run failed: aborted after ${rateLimitCount} rate-limit errors`,
        );
      }
      return allResults;
    }

    // Complete run
    if (runId) {
      await completeRun(runId, {
        kind: "completed",
        durationMs: Date.now() - runStartTime,
      });
      logInfo(`Completed run ${runId}`);
    }

    return allResults;
  } finally {
    // Restore env vars
    if (prevGuidelinesPath !== undefined) {
      process.env.CUSTOM_GUIDELINES_PATH = prevGuidelinesPath;
    } else {
      delete process.env.CUSTOM_GUIDELINES_PATH;
    }
    if (prevExperiment !== undefined) {
      process.env.EVALS_EXPERIMENT = prevExperiment;
    } else {
      delete process.env.EVALS_EXPERIMENT;
    }
  }
}

/** Process a single eval. Returns `true` if the failure was a rate-limit error. */
async function processOneEval(
  model: ModelTemplate,
  modelImpl: Model,
  evalInfo: EvalInfo,
  runId: string | null,
  allResults: EvalIndividualResult[],
  totalEvals: number,
  tempdir: string,
): Promise<boolean> {
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

    const result = buildEvalResult(category, name, model.name, scores, tempdir);
    allResults.push(result);
    logProgress(evalPathStr, result, allResults, totalEvals, evalStartTime);
    return false;
  } catch (e) {
    const errorStr = String(e);
    const rateLimited = isRateLimitError(errorStr);
    const prefix = rateLimited ? "[rate_limit] " : "";
    console.error(`[${evalPathStr}] ERROR: ${errorStr}`);
    allResults.push({
      category,
      name,
      passed: false,
      tests_pass_score: 0,
      failure_reason: `${prefix}error: ${errorStr}`,
      directory_path: null,
      scores: {},
    });

    // Mark the eval as failed in Convex so the run can be fully completed.
    // Without this, the eval stays "pending" and isFullyCompletedRun returns
    // false, preventing the run from appearing on the leaderboard.
    // Rate-limit failures are tagged with [rate_limit] so the leaderboard
    // can exclude them from scoring (they reflect infrastructure limits,
    // not model quality).
    if (evalId) {
      await completeEval(evalId, {
        kind: "failed",
        failureReason: `${prefix}error: ${errorStr}`,
        durationMs: Date.now() - evalStartTime,
      });
    }

    logProgress(
      evalPathStr,
      allResults[allResults.length - 1],
      allResults,
      totalEvals,
      evalStartTime,
    );

    return rateLimited;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Detect whether an error is a rate-limit / quota error from the provider. */
function isRateLimitError(errorStr: string): boolean {
  const lower = errorStr.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("too many requests") ||
    lower.includes("quota") ||
    lower.includes("429") ||
    lower.includes("throttl")
  );
}

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
  tempdir: string,
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

// ── Run (only when executed directly, not when imported) ──────────────

// Bun sets import.meta.main to true when the file is the entrypoint.
// We also check process.argv as a fallback for other runtimes.
const isMain =
  (import.meta as { main?: boolean }).main === true ||
  process.argv[1]?.replace(/\\/g, "/").endsWith("runner/index.ts") ||
  process.argv[1]?.replace(/\\/g, "/").endsWith("runner/index.js");

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
