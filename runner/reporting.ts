/**
 * Reporting: post results to Convex via ConvexClient and write local JSONL files.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, unlinkSync, appendFileSync } from "fs";
import { join, relative } from "path";
import { tmpdir } from "os";
import { createHash } from "crypto";
import JSZip from "jszip";
import { ConvexClient } from "convex/browser";
import { logInfo } from "./logging.js";
import { api } from "../evalScores/convex/_generated/api.js";
import type { Id } from "../evalScores/convex/_generated/dataModel.js";

// ── Config ────────────────────────────────────────────────────────────

const OUTPUT_RESULTS_FILE = process.env.LOCAL_RESULTS ?? "local_results.jsonl";
const CONVEX_EVAL_URL = process.env.CONVEX_EVAL_URL;
const CONVEX_AUTH_TOKEN = process.env.CONVEX_AUTH_TOKEN;
const EVALS_EXPERIMENT = process.env.EVALS_EXPERIMENT;

// Cache for eval source hashes to avoid re-uploading
const evalSourceCache = new Map<string, string>();

// ── Convex client (lazy-initialized) ─────────────────────────────────

let _client: ConvexClient | null = null;

function getClient(): ConvexClient | null {
  if (!CONVEX_EVAL_URL) return null;
  if (!_client) {
    _client = new ConvexClient(CONVEX_EVAL_URL);
  }
  return _client;
}

function isConfigured(): boolean {
  return !!(CONVEX_EVAL_URL && CONVEX_AUTH_TOKEN);
}

/** Close the Convex client. Call at process shutdown. */
export async function closeClient(): Promise<void> {
  if (_client) {
    await _client.close();
    _client = null;
  }
}

// ── Run lifecycle ─────────────────────────────────────────────────────

export async function startRun(
  model: string,
  plannedEvals: string[],
  provider?: string,
  experiment?: string,
): Promise<string | null> {
  const client = getClient();
  if (!client || !CONVEX_AUTH_TOKEN) {
    logInfo("Skipping startRun: CONVEX_EVAL_URL or CONVEX_AUTH_TOKEN not set");
    return null;
  }

  const exp = experiment ?? EVALS_EXPERIMENT;

  try {
    const runId = await client.mutation(api.admin.startRun, {
      token: CONVEX_AUTH_TOKEN,
      model,
      plannedEvals,
      provider,
      experiment: exp as "no_guidelines" | undefined,
    });
    logInfo("Successfully called startRun");
    return runId as string;
  } catch (e) {
    logInfo(`Error calling startRun: ${String(e)}`);
    return null;
  }
}

export async function completeRun(
  runId: string,
  status:
    | { kind: "completed"; durationMs: number }
    | { kind: "failed"; failureReason: string; durationMs: number },
): Promise<boolean> {
  const client = getClient();
  if (!client || !CONVEX_AUTH_TOKEN) return false;

  try {
    await client.mutation(api.admin.completeRun, {
      token: CONVEX_AUTH_TOKEN,
      runId: runId as Id<"runs">,
      status,
    });
    logInfo("Successfully called completeRun");
    return true;
  } catch (e) {
    logInfo(`Error calling completeRun: ${String(e)}`);
    return false;
  }
}

// ── Eval lifecycle ────────────────────────────────────────────────────

export async function startEval(
  runId: string,
  evalPath: string,
  category: string,
  name: string,
  task?: string,
  evalSourceStorageId?: string,
): Promise<string | null> {
  const client = getClient();
  if (!client || !CONVEX_AUTH_TOKEN) return null;

  try {
    const evalId = await client.mutation(api.admin.startEval, {
      token: CONVEX_AUTH_TOKEN,
      runId: runId as Id<"runs">,
      evalPath,
      category,
      name,
      task,
      evalSourceStorageId: evalSourceStorageId as Id<"_storage"> | undefined,
    });
    logInfo("Successfully called startEval");
    return evalId as string;
  } catch (e) {
    logInfo(`Error calling startEval: ${String(e)}`);
    return null;
  }
}

type StepName = "filesystem" | "install" | "deploy" | "tsc" | "eslint" | "tests";
type StepStatus =
  | { kind: "running" }
  | { kind: "passed"; durationMs: number }
  | { kind: "failed"; failureReason: string; durationMs: number }
  | { kind: "skipped" };

export function recordStep(
  evalId: string,
  stepName: StepName,
  status: StepStatus,
): void {
  const client = getClient();
  if (!client || !CONVEX_AUTH_TOKEN) return;

  // Fire and forget - don't block the scorer
  client
    .mutation(api.admin.recordStep, {
      token: CONVEX_AUTH_TOKEN,
      evalId: evalId as Id<"evals">,
      name: stepName,
      status,
    })
    .catch(() => {});
}

/**
 * Upload current output directory and attach to a running eval.
 * This enables the visualizer to show partial output before the eval completes.
 * Fire-and-forget: errors are logged but don't block the scorer.
 */
export async function uploadEvalOutput(
  evalId: string,
  outputDir: string,
): Promise<void> {
  const client = getClient();
  if (!client || !CONVEX_AUTH_TOKEN) return;

  try {
    const zipPath = await zipOutputDirectory(outputDir);
    if (!zipPath) return;
    try {
      const storageId = await uploadToConvexStorage(zipPath);
      if (storageId) {
        await client.mutation(api.admin.updateEvalOutput, {
          token: CONVEX_AUTH_TOKEN,
          evalId: evalId as Id<"evals">,
          outputStorageId: storageId as Id<"_storage">,
        });
      }
    } finally {
      try { unlinkSync(zipPath); } catch { /* ignore */ }
    }
  } catch {
    // Best-effort: don't block scoring if incremental upload fails
  }
}

type EvalCompleteStatus =
  | { kind: "passed"; durationMs: number; outputStorageId?: Id<"_storage"> }
  | { kind: "failed"; failureReason: string; durationMs: number; outputStorageId?: Id<"_storage"> };

export async function completeEval(
  evalId: string,
  status: { kind: "passed"; durationMs: number } | { kind: "failed"; failureReason: string; durationMs: number },
  outputDir?: string,
): Promise<boolean> {
  const client = getClient();
  if (!client || !CONVEX_AUTH_TOKEN) return false;

  let outputStorageId: Id<"_storage"> | undefined;
  if (outputDir) {
    const zipPath = await zipOutputDirectory(outputDir);
    if (zipPath) {
      try {
        const sid = await uploadToConvexStorage(zipPath);
        if (sid) outputStorageId = sid as Id<"_storage">;
      } finally {
        try { unlinkSync(zipPath); } catch { /* ignore */ }
      }
    }
  }

  const fullStatus: EvalCompleteStatus = outputStorageId
    ? { ...status, outputStorageId }
    : status;

  try {
    await client.mutation(api.admin.completeEval, {
      token: CONVEX_AUTH_TOKEN,
      evalId: evalId as Id<"evals">,
      status: fullStatus,
    });
    logInfo("Successfully called completeEval");
    return true;
  } catch (e) {
    logInfo(`Error calling completeEval: ${String(e)}`);
    return false;
  }
}

// ── Eval source upload with dedup ─────────────────────────────────────

export async function getOrUploadEvalSource(
  evalPath: string,
): Promise<{ taskContent: string | null; storageId: string | null }> {
  if (!isConfigured()) {
    return { taskContent: null, storageId: null };
  }

  const taskContent = getTaskContent(evalPath);
  const dirHash = computeDirectoryHash(evalPath);

  // Check if already uploaded
  const existing = await checkAssetHash(dirHash);
  if (existing) {
    logInfo(`Eval source already uploaded (hash: ${dirHash.slice(0, 8)}...)`);
    return { taskContent, storageId: existing };
  }

  const zipPath = await zipEvalSource(evalPath);
  if (!zipPath) return { taskContent, storageId: null };

  try {
    const storageId = await uploadToConvexStorage(zipPath);
    if (storageId) {
      await registerAsset(dirHash, "evalSource", storageId);
      logInfo(`Uploaded and registered eval source (hash: ${dirHash.slice(0, 8)}...)`);
      return { taskContent, storageId };
    }
  } finally {
    try { unlinkSync(zipPath); } catch { /* ignore */ }
  }
  return { taskContent, storageId: null };
}

// ── Score posting ─────────────────────────────────────────────────────

export async function postScoresToConvex(
  modelName: string,
  categoryScores: Record<string, number>,
  totalScore: number,
): Promise<void> {
  const postToConvex = process.env.POST_TO_CONVEX === "1";
  if (!postToConvex) return;

  const client = getClient();
  if (!client || !CONVEX_AUTH_TOKEN) return;

  try {
    await client.mutation(api.admin.updateScores, {
      token: CONVEX_AUTH_TOKEN,
      model: modelName,
      scores: categoryScores,
      totalScore,
      experiment: EVALS_EXPERIMENT as "no_guidelines" | undefined,
    });
    logInfo(`Successfully posted scores for model ${modelName} to Convex`);
  } catch (e) {
    logInfo(`Error posting scores to Convex: ${String(e)}`);
  }
}

// ── Local JSONL results ───────────────────────────────────────────────

export interface EvalIndividualResult {
  category: string;
  name: string;
  passed: boolean;
  tests_pass_score: number;
  failure_reason: string | null;
  directory_path: string | null;
  scores: Record<string, number>;
}

export function writeLocalResults(
  modelName: string,
  formattedModelName: string,
  tempdir: string | null,
  individualResults: EvalIndividualResult[],
): void {
  try {
    const categorySummaries: Record<
      string,
      { total: number; passed: number; failed: number }
    > = {};

    for (const r of individualResults) {
      if (!categorySummaries[r.category]) {
        categorySummaries[r.category] = { total: 0, passed: 0, failed: 0 };
      }
      categorySummaries[r.category].total++;
      if (r.passed) categorySummaries[r.category].passed++;
      else categorySummaries[r.category].failed++;
    }

    const totalTests = individualResults.length;
    const totalPassed = individualResults.filter((r) => r.passed).length;
    const overallScore = totalTests > 0 ? totalPassed / totalTests : 0;

    // Build score summary (matching the old Braintrust format)
    const scoreSummary: Record<string, unknown> = {};
    const scoreNames = new Set<string>();
    for (const r of individualResults) {
      for (const name of Object.keys(r.scores)) {
        scoreNames.add(name);
      }
    }
    for (const scoreName of scoreNames) {
      const values = individualResults.map((r) => r.scores[scoreName] ?? 0);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      scoreSummary[scoreName] = {
        name: scoreName,
        score: avg,
        improvements: 0,
        regressions: 0,
        diff: null,
      };
    }

    const entry = {
      summary: {
        project_name: "Convex Coding",
        project_id: null,
        experiment_id: null,
        experiment_name: formattedModelName,
        project_url: null,
        experiment_url: null,
        comparison_experiment_name: null,
        scores: scoreSummary,
        metrics: {},
      },
      tempdir,
      model_name: formattedModelName,
      individual_results: individualResults,
      category_summaries: categorySummaries,
      run_stats: {
        total_tests: totalTests,
        total_passed: totalPassed,
        total_failed: totalTests - totalPassed,
        overall_score: overallScore,
      },
    };

    appendFileSync(OUTPUT_RESULTS_FILE, JSON.stringify(entry) + "\n", "utf-8");
  } catch (e) {
    console.error(`Failed to write local results file: ${String(e)}`);
  }
}

/** Print a console summary after all evals complete. */
export function printEvalSummary(
  modelName: string,
  individualResults: EvalIndividualResult[],
): void {
  const numTests: Record<string, number> = {};
  const testScores: Record<string, number> = {};
  const passedCounts: Record<string, number> = {};
  let totalScore = 0;
  let totalTests = 0;
  let totalPassed = 0;

  for (const r of individualResults) {
    numTests[r.category] = (numTests[r.category] ?? 0) + 1;
    testScores[r.category] = (testScores[r.category] ?? 0) + r.tests_pass_score;
    if (r.tests_pass_score >= 1) {
      passedCounts[r.category] = (passedCounts[r.category] ?? 0) + 1;
      totalPassed++;
    }
    totalTests++;
    totalScore += r.tests_pass_score;
  }

  const overallRate = totalTests > 0 ? totalScore / totalTests : 0;

  logInfo("");
  logInfo("=== Eval Summary ===");
  logInfo(`Model: ${modelName}`);
  logInfo(
    `Overall: ${(overallRate * 100).toFixed(2)}% (${totalPassed} pass, ${totalTests - totalPassed} fail)`,
  );
  for (const category of Object.keys(numTests).sort()) {
    const rate =
      numTests[category] > 0
        ? (testScores[category] ?? 0) / numTests[category]
        : 0;
    const catPass = passedCounts[category] ?? 0;
    logInfo(
      `- ${category}: ${(rate * 100).toFixed(2)}% (${catPass} pass, ${numTests[category] - catPass} fail)`,
    );
  }
  logInfo(`Results written to: ${OUTPUT_RESULTS_FILE}`);

  // Post aggregate scores to Convex
  const categoryScoreMap: Record<string, number> = {};
  for (const cat of Object.keys(numTests)) {
    categoryScoreMap[cat] =
      numTests[cat] > 0 ? (testScores[cat] ?? 0) / numTests[cat] : 0;
  }
  postScoresToConvex(modelName, categoryScoreMap, overallRate).catch(() => {});
}

// ── Upload / zip helpers ──────────────────────────────────────────────

function shouldExcludeFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.startsWith(".env") || lower.startsWith("bun.lock");
}

async function zipOutputDirectory(outputDir: string): Promise<string | null> {
  return zipDirectory(outputDir, ["node_modules", "_generated"]);
}

async function zipEvalSource(evalPath: string): Promise<string | null> {
  return zipDirectory(evalPath, ["node_modules", "_generated", "__pycache__"]);
}

async function zipDirectory(
  dir: string,
  excludeDirs: string[],
): Promise<string | null> {
  if (!existsSync(dir)) return null;
  try {
    const files: string[] = [];
    walkDirForZip(dir, dir, excludeDirs, files);
    if (files.length === 0) return null;

    const zip = new JSZip();
    for (const relPath of files) {
      const fullPath = join(dir, relPath);
      const data = readFileSync(fullPath);
      // Use forward slashes in zip entries for cross-platform compatibility
      zip.file(relPath.replace(/\\/g, "/"), data);
    }

    const zipPath = join(
      tmpdir(),
      `convex-evals-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`,
    );

    const content = await zip.generateAsync({ type: "nodebuffer" });
    writeFileSync(zipPath, content);
    return zipPath;
  } catch (e) {
    logInfo(`Error creating zip file: ${String(e)}`);
    return null;
  }
}

function walkDirForZip(
  baseDir: string,
  currentDir: string,
  excludeDirs: string[],
  files: string[],
): void {
  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (excludeDirs.includes(entry.name)) continue;
      walkDirForZip(baseDir, join(currentDir, entry.name), excludeDirs, files);
    } else {
      if (shouldExcludeFile(entry.name)) continue;
      files.push(relative(baseDir, join(currentDir, entry.name)));
    }
  }
}

async function uploadToConvexStorage(
  zipPath: string,
): Promise<string | null> {
  const client = getClient();
  if (!client || !CONVEX_AUTH_TOKEN) return null;

  try {
    const uploadUrl: string = await client.mutation(
      api.admin.generateUploadUrl,
      { token: CONVEX_AUTH_TOKEN },
    );

    const fileData = Bun.file(zipPath);
    const resp = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": "application/zip" },
      body: fileData,
    });
    if (resp.ok) {
      const json = (await resp.json()) as Record<string, unknown>;
      const storageId = json.storageId as string | undefined;
      if (storageId) {
        logInfo(`Successfully uploaded to Convex storage: ${storageId}`);
        return storageId;
      }
    }
    logInfo(`Failed to upload: HTTP ${resp.status}`);
    return null;
  } catch (e) {
    logInfo(`Error uploading to Convex storage: ${String(e)}`);
    return null;
  }
}

function computeDirectoryHash(
  dirPath: string,
  excludeDirs = ["node_modules", "_generated", "__pycache__"],
): string {
  const hasher = createHash("md5");
  walkForHash(dirPath, dirPath, excludeDirs, hasher);
  return hasher.digest("hex");
}

function walkForHash(
  baseDir: string,
  dir: string,
  excludeDirs: string[],
  hasher: ReturnType<typeof createHash>,
): void {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (excludeDirs.includes(entry.name)) continue;
      walkForHash(baseDir, join(dir, entry.name), excludeDirs, hasher);
    } else {
      const fullPath = join(dir, entry.name);
      const relPath = relative(baseDir, fullPath);
      hasher.update(relPath);
      try {
        hasher.update(readFileSync(fullPath));
      } catch { /* ignore */ }
    }
  }
}

async function checkAssetHash(hash: string): Promise<string | null> {
  if (evalSourceCache.has(hash)) return evalSourceCache.get(hash)!;

  const client = getClient();
  if (!client || !CONVEX_AUTH_TOKEN) return null;

  try {
    const result = await client.mutation(api.admin.checkAssetHash, {
      token: CONVEX_AUTH_TOKEN,
      hash,
    });
    if (result?.exists && typeof result.storageId === "string") {
      evalSourceCache.set(hash, result.storageId);
      return result.storageId;
    }
  } catch (e) {
    logInfo(`Error checking asset hash: ${String(e)}`);
  }
  return null;
}

async function registerAsset(
  hash: string,
  assetType: "evalSource" | "output",
  storageId: string,
): Promise<boolean> {
  const client = getClient();
  if (!client || !CONVEX_AUTH_TOKEN) return false;

  try {
    await client.mutation(api.admin.registerAsset, {
      token: CONVEX_AUTH_TOKEN,
      hash,
      assetType,
      storageId: storageId as Id<"_storage">,
    });
    evalSourceCache.set(hash, storageId);
    return true;
  } catch (e) {
    logInfo(`Error registering asset: ${String(e)}`);
    return false;
  }
}

function getTaskContent(evalPath: string): string | null {
  const taskFile = join(evalPath, "TASK.txt");
  if (existsSync(taskFile)) {
    try {
      return readFileSync(taskFile, "utf-8");
    } catch { /* ignore */ }
  }
  return null;
}
