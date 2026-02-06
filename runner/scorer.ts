/**
 * Scoring pipeline: writes generated files, installs deps, deploys, typechecks,
 * lints, and runs tests against a local Convex backend.
 */
import { mkdirSync, existsSync, writeFileSync, readdirSync, statSync, readFileSync } from "fs";
import { join, resolve, relative } from "path";
import { tmpdir } from "os";
import { $ } from "bun";
import {
  withConvexBackend,
  ADMIN_KEY,
  type ConvexBackend,
} from "./convexBackend.js";
import {
  appendLog,
  logInfo,
  logVitestResults,
  runCommandStep,
} from "./logging.js";
import { recordStep, completeEval } from "./reporting.js";

// ── Timeout constants (ms) ───────────────────────────────────────────

const BUN_INSTALL_TIMEOUT = 60_000;
const CODEGEN_TIMEOUT = 60_000;
const TSC_TIMEOUT = 60_000;
const ESLINT_TIMEOUT = 60_000;
const DEPLOY_TIMEOUT = 90_000;
const VITEST_TIMEOUT = 120_000;

/** Race a promise against a timeout. Rejects with TimeoutError on timeout. */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

// ── Types ─────────────────────────────────────────────────────────────

export interface ScoreResult {
  name: string;
  score: number;
}

// ── Main scorer ───────────────────────────────────────────────────────

export async function convexScorer(
  tempdir: string,
  input: string,
  expected: Record<string, string>,
  metadata: Record<string, unknown>,
  output: Record<string, string>,
): Promise<ScoreResult[]> {
  const model = metadata.model as string;
  const category = metadata.category as string;
  const name = metadata.eval_name as string;
  const evalId = metadata.eval_id as string | undefined;

  const outputProjectDir = resolve(
    join(tempdir, "output", model, category, name),
  );
  mkdirSync(outputProjectDir, { recursive: true });

  const scores: ScoreResult[] = [];
  let passedFilesystem = false;
  let passedInstall = false;
  let passedCodegen = false;
  let passedTsc = false;
  let passedEslint = false;
  let passedDeploy = false;

  const evalStartTime = Date.now();
  logInfo(`[${category}/${name}] Writing generated filesystem`);

  const runLogPath = join(outputProjectDir, "run.log");
  appendLog(runLogPath, `=== Eval: ${category}/${name} ===`);

  // ── Filesystem step ──
  let stepStart = Date.now();
  try {
    writeFilesystem(outputProjectDir, output);
    scores.push({ name: "Valid filesystem output", score: 1 });
    passedFilesystem = true;
    appendLog(runLogPath, "[ok] write_filesystem");
    if (evalId) void recordStep(evalId, "filesystem", { kind: "passed", durationMs: Date.now() - stepStart });
  } catch (e) {
    scores.push({ name: "Valid filesystem output", score: 0 });
    appendLog(runLogPath, `[error] write_filesystem: ${String(e)}`);
    logInfo(`[eval] Result ❌ ${category}/${name} – filesystem fail – dir: ${outputProjectDir}`);
    if (evalId) {
      void recordStep(evalId, "filesystem", { kind: "failed", failureReason: String(e), durationMs: Date.now() - stepStart });
      void completeEval(evalId, { kind: "failed", failureReason: "filesystem fail", durationMs: Date.now() - evalStartTime }, outputProjectDir);
    }
    return scores;
  }

  // ── Install step ──
  logInfo(`[${category}/${name}] Installing dependencies (bun install)`);
  stepStart = Date.now();
  if (
    await runCommandStep(
      runLogPath,
      async () => installDependencies(outputProjectDir),
      "bun",
      "bun install",
    )
  ) {
    scores.push({ name: "`bun install` succeeds", score: 1 });
    passedInstall = true;
    if (evalId) void recordStep(evalId, "install", { kind: "passed", durationMs: Date.now() - stepStart });
  } else {
    scores.push({ name: "`bun install` succeeds", score: 0 });
    logInfo(`Result ❌ – bun install fail – dir: ${outputProjectDir}`);
    if (evalId) {
      void recordStep(evalId, "install", { kind: "failed", failureReason: "bun install failed", durationMs: Date.now() - stepStart });
      void completeEval(evalId, { kind: "failed", failureReason: "install fail", durationMs: Date.now() - evalStartTime }, outputProjectDir);
    }
    return scores;
  }

  // ── Deploy + typecheck + lint + tests (inside backend context) ──
  const outputBackendDir = join(
    tempdir,
    "backends",
    "output",
    model,
    category,
    name,
  );
  mkdirSync(outputBackendDir, { recursive: true });

  await withConvexBackend(outputBackendDir, async (outputBackend) => {
    // Deploy
    logInfo(`[${category}/${name}] Deploying generated backend on port ${outputBackend.port}`);
    stepStart = Date.now();
    if (
      await runCommandStep(
        runLogPath,
        async () => deploy(outputBackend, outputProjectDir),
        "convex-dev",
        "convex dev",
      )
    ) {
      scores.push({ name: "`convex dev` succeeds", score: 1 });
      passedDeploy = true;
      passedCodegen = true;
      if (evalId) void recordStep(evalId, "deploy", { kind: "passed", durationMs: Date.now() - stepStart });
    } else {
      scores.push({ name: "`convex dev` succeeds", score: 0 });
      logInfo(`Result ❌ – convex dev fail – dir: ${outputProjectDir}`);
      if (evalId) {
        void recordStep(evalId, "deploy", { kind: "failed", failureReason: "convex dev failed", durationMs: Date.now() - stepStart });
        void completeEval(evalId, { kind: "failed", failureReason: "convex dev fail", durationMs: Date.now() - evalStartTime }, outputProjectDir);
      }
      return;
    }

    // Typecheck
    logInfo(`[${category}/${name}] Typechecking (tsc)`);
    stepStart = Date.now();
    if (
      await runCommandStep(
        runLogPath,
        async () => typecheckCode(outputProjectDir),
        "tsc",
        "tsc",
      )
    ) {
      scores.push({ name: "Passes tsc", score: 1 });
      passedTsc = true;
      if (evalId) void recordStep(evalId, "tsc", { kind: "passed", durationMs: Date.now() - stepStart });
    } else {
      scores.push({ name: "Passes tsc", score: 0 });
      if (evalId) void recordStep(evalId, "tsc", { kind: "failed", failureReason: "tsc failed", durationMs: Date.now() - stepStart });
    }

    // Lint
    logInfo(`[${category}/${name}] Linting (eslint)`);
    stepStart = Date.now();
    if (
      await runCommandStep(
        runLogPath,
        async () => lintCode(outputProjectDir),
        "eslint",
        "eslint",
      )
    ) {
      scores.push({ name: "Passes eslint", score: 1 });
      passedEslint = true;
      if (evalId) void recordStep(evalId, "eslint", { kind: "passed", durationMs: Date.now() - stepStart });
    } else {
      scores.push({ name: "Passes eslint", score: 0 });
      if (evalId) void recordStep(evalId, "eslint", { kind: "failed", failureReason: "eslint failed", durationMs: Date.now() - stepStart });
    }

    // Setup answer backend
    const evalPath = `evals/${category}/${name}`;
    const { answerProjectDir, answerBackendDir } = setupAnswerBackend(
      tempdir,
      evalPath,
      model,
      category,
      name,
    );

    logInfo(`[${category}/${name}] Setting up answer backend`);
    logInfo(`[${category}/${name}] Installing answer dependencies`);
    await runCommandStep(
      runLogPath,
      async () => installDependencies(answerProjectDir),
      "answer-bun",
      "(answer) bun install",
      "(answer) ",
    );

    await withConvexBackend(answerBackendDir, async (answerBackend) => {
      logInfo(`[${category}/${name}] Deploying answer backend on port ${answerBackend.port}`);
      await runCommandStep(
        runLogPath,
        async () => deploy(answerBackend, answerProjectDir),
        "answer-convex-dev",
        "(answer) convex dev",
        "(answer) ",
      );

      const testFile = resolve(join(evalPath, "grader.test.ts"));
      let testsRatio = 0;
      let vitestStdout: string | null = null;
      let testCmd: string | null = null;

      stepStart = Date.now();
      try {
        logInfo(`[${category}/${name}] Running tests`);
        const testResult = await runTests(outputBackend, answerBackend, testFile);
        testsRatio = testResult.ratio;
        vitestStdout = testResult.stdout;
        testCmd = testResult.cmd;
        scores.push({ name: "Tests pass", score: testsRatio });
        if (evalId) {
          if (testsRatio === 1) {
            void recordStep(evalId, "tests", { kind: "passed", durationMs: Date.now() - stepStart });
          } else {
            void recordStep(evalId, "tests", { kind: "failed", failureReason: `tests failed (${(testsRatio * 100).toFixed(0)}%)`, durationMs: Date.now() - stepStart });
          }
        }
      } catch (e) {
        if (e instanceof TestsFailedError) {
          testsRatio = e.ratio;
          vitestStdout = e.vitestStdout;
          testCmd = e.testCmd;
          scores.push({ name: "Tests pass", score: e.ratio });
          if (evalId) void recordStep(evalId, "tests", { kind: "failed", failureReason: `tests failed (${(e.ratio * 100).toFixed(0)}%)`, durationMs: Date.now() - stepStart });
        } else {
          scores.push({ name: "Tests pass", score: 0 });
          if (evalId) void recordStep(evalId, "tests", { kind: "failed", failureReason: String(e), durationMs: Date.now() - stepStart });
        }
        appendLog(runLogPath, `[error] vitest: ${String(e)}`);
      }

      if (testCmd && vitestStdout) {
        logVitestResults(runLogPath, testCmd, vitestStdout);
      }

      const allPassed =
        passedFilesystem &&
        passedInstall &&
        passedCodegen &&
        passedTsc &&
        passedEslint &&
        passedDeploy &&
        testsRatio === 1;

      const status = allPassed ? "✅" : "❌";
      const failures: string[] = [];
      if (!passedInstall) failures.push("bun install fail");
      if (!passedCodegen) failures.push("codegen fail");
      if (!passedTsc) failures.push("tsc fail");
      if (!passedEslint) failures.push("eslint fail");
      if (!passedDeploy) failures.push("convex dev fail");
      if (testsRatio !== 1) failures.push(`tests fail (${(testsRatio * 100).toFixed(0)}%)`);

      const details = failures.length === 0 ? "ok" : failures.join(", ");
      logInfo(`Result ${status} – ${details} – dir: ${outputProjectDir}`);

      if (evalId) {
        const evalDuration = Date.now() - evalStartTime;
        if (allPassed) {
          void completeEval(evalId, { kind: "passed", durationMs: evalDuration }, outputProjectDir);
        } else {
          void completeEval(
            evalId,
            { kind: "failed", failureReason: failures[0] ?? "unknown fail", durationMs: evalDuration },
            outputProjectDir,
          );
        }
      }
    });
  });

  return scores;
}

// ── Error types ───────────────────────────────────────────────────────

class TestsFailedError extends Error {
  constructor(
    message: string,
    public ratio: number,
    public vitestStdout: string,
    public testCmd: string,
  ) {
    super(message);
  }
}

// ── Step implementations ──────────────────────────────────────────────

function writeFilesystem(
  projectDir: string,
  output: Record<string, string>,
): void {
  const absDir = resolve(projectDir);
  for (const [relativePath, content] of Object.entries(output)) {
    const filePath = resolve(join(absDir, relativePath));
    if (!filePath.startsWith(absDir)) {
      throw new Error(
        `Invalid filesystem output: ${filePath} is not in ${absDir}`,
      );
    }
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, content, "utf-8");
  }
}

async function installDependencies(
  projectDir: string,
): Promise<Array<{ cmd: string; stdout: string }>> {
  const result = await withTimeout(
    $`bun install`.cwd(projectDir).nothrow().quiet(),
    BUN_INSTALL_TIMEOUT,
    "bun install",
  );
  if (result.exitCode !== 0) {
    throw new Error(`Failed to install dependencies:\n${result.text()}`);
  }
  return [{ cmd: "bun install", stdout: result.text() }];
}

async function deploy(
  backend: ConvexBackend,
  projectDir: string,
): Promise<Array<{ cmd: string; stdout: string }>> {
  const results: Array<{ cmd: string; stdout: string }> = [];
  const convexUrl = `http://localhost:${backend.port}`;

  // Run codegen --init first
  const initResult = await withTimeout(
    $`bunx convex codegen --typecheck disable --init`.cwd(projectDir).nothrow().quiet(),
    CODEGEN_TIMEOUT,
    "convex codegen",
  );
  results.push({
    cmd: "bunx convex codegen --typecheck disable --init",
    stdout: initResult.text(),
  });

  // Deploy
  const deployResult = await withTimeout(
    $`bunx convex dev --once --admin-key ${ADMIN_KEY} --url ${convexUrl}`
      .cwd(projectDir).nothrow().quiet(),
    DEPLOY_TIMEOUT,
    "convex dev",
  );

  const stdout = deployResult.text();
  const deploySucceeded =
    deployResult.exitCode === 0 || stdout.includes("Convex functions ready!");
  if (!deploySucceeded) {
    throw new Error(`Failed to deploy:\n${stdout}`);
  }

  results.push({
    cmd: `bunx convex dev --once --url ${convexUrl}`,
    stdout,
  });
  return results;
}

async function typecheckCode(
  projectDir: string,
): Promise<Array<{ cmd: string; stdout: string }>> {
  const results: Array<{ cmd: string; stdout: string }> = [];
  const convexDir = resolve(join(projectDir, "convex"));

  const tscConvex = await withTimeout(
    $`bunx tsc -noEmit -p ${convexDir}`.cwd(projectDir).nothrow().quiet(),
    TSC_TIMEOUT,
    "tsc (convex)",
  );
  if (tscConvex.exitCode !== 0) {
    throw new Error(`Failed to typecheck code:\n${tscConvex.text()}`);
  }
  results.push({ cmd: `bunx tsc -noEmit -p ${convexDir}`, stdout: tscConvex.text() });

  const srcDir = resolve(join(projectDir, "src"));
  if (existsSync(srcDir)) {
    const tscSrc = await withTimeout(
      $`bunx tsc -noEmit -p .`.cwd(projectDir).nothrow().quiet(),
      TSC_TIMEOUT,
      "tsc (src)",
    );
    if (tscSrc.exitCode !== 0) {
      throw new Error(`Failed to typecheck code:\n${tscSrc.text()}`);
    }
    results.push({ cmd: "bunx tsc -noEmit -p .", stdout: tscSrc.text() });
  }
  return results;
}

async function lintCode(
  projectDir: string,
): Promise<Array<{ cmd: string; stdout: string }>> {
  const results: Array<{ cmd: string; stdout: string }> = [];
  const eslintConfig = resolve("eslint.config.mjs");

  const eslintConvex = await withTimeout(
    $`bunx eslint -c ${eslintConfig} convex`.cwd(projectDir).nothrow().quiet(),
    ESLINT_TIMEOUT,
    "eslint (convex)",
  );
  if (eslintConvex.exitCode !== 0) {
    throw new Error(`Failed to lint code:\n${eslintConvex.text()}`);
  }
  results.push({
    cmd: `bunx eslint -c ${eslintConfig} convex`,
    stdout: eslintConvex.text(),
  });

  const srcDir = join(projectDir, "src");
  if (existsSync(srcDir)) {
    const srcEslintConfig = resolve("src.eslint.config.mjs");
    const eslintSrc = await withTimeout(
      $`bunx eslint -c ${srcEslintConfig} src`.cwd(projectDir).nothrow().quiet(),
      ESLINT_TIMEOUT,
      "eslint (src)",
    );
    if (eslintSrc.exitCode !== 0) {
      throw new Error(`Failed to lint code:\n${eslintSrc.text()}`);
    }
    results.push({
      cmd: `bunx eslint -c ${srcEslintConfig} src`,
      stdout: eslintSrc.text(),
    });
  }
  return results;
}

function setupAnswerBackend(
  tempdir: string,
  evalPath: string,
  model: string,
  category: string,
  name: string,
): { answerProjectDir: string; answerBackendDir: string } {
  const answerProjectDir = join(tempdir, "answer", model, category, name);
  mkdirSync(answerProjectDir, { recursive: true });

  const answerDir = join(evalPath, "answer");
  for (const filePath of walkAnswer(answerDir)) {
    const relPath = relative(answerDir, filePath).replace(/\\/g, "/");
    const destPath = join(answerProjectDir, relPath);
    mkdirSync(join(destPath, ".."), { recursive: true });
    writeFileSync(destPath, readFileSync(filePath));
  }

  const answerBackendDir = join(
    tempdir,
    "backends",
    "answer",
    model,
    category,
    name,
  );
  mkdirSync(answerBackendDir, { recursive: true });

  return { answerProjectDir, answerBackendDir };
}

async function runTests(
  backend: ConvexBackend,
  answerBackend: ConvexBackend,
  testFile: string,
): Promise<{ ratio: number; stdout: string; cmd: string }> {
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    CONVEX_PORT: String(backend.port),
    CONVEX_ANSWER_PORT: String(answerBackend.port),
  };

  // Write JSON reporter output to a temp file
  const tmpJsonPath = join(tmpdir(), `vitest-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

  const cmd = `bunx vitest run ${testFile} --reporter=json --outputFile ${tmpJsonPath} --reporter=default --no-color`;
  const result = await withTimeout(
    $`bunx vitest run ${testFile} --reporter=json --outputFile ${tmpJsonPath} --reporter=default --no-color`
      .env(env).nothrow().quiet(),
    VITEST_TIMEOUT,
    "vitest",
  );

  const stdout = result.text();

  // Parse JSON results
  let ratio = 0;
  try {
    const jsonContent = readFileSync(tmpJsonPath, "utf-8");
    const parsed = JSON.parse(jsonContent) as { numTotalTests?: number; numPassedTests?: number };
    const total = parsed.numTotalTests ?? 0;
    const passed = parsed.numPassedTests ?? 0;
    ratio = total > 0 ? passed / total : 0;
  } catch (e) {
    if (result.exitCode !== 0) {
      throw new Error(`Tests failed:\n${stdout}`);
    }
    throw new Error(`Failed to parse test results from ${tmpJsonPath}: ${String(e)}`);
  } finally {
    try {
      const { unlinkSync } = await import("fs");
      unlinkSync(tmpJsonPath);
    } catch { /* ignore */ }
  }

  if (ratio !== 1) {
    throw new TestsFailedError(
      `Tests failed (ratio: ${ratio})`,
      ratio,
      stdout,
      cmd,
    );
  }

  return { ratio, stdout, cmd };
}

/** Walk answer directory, yielding paths to .ts and package.json files. */
export function* walkAnswer(answerDir: string): Generator<string> {
  if (!existsSync(answerDir)) return;
  for (const entry of readdirSync(answerDir, { withFileTypes: true })) {
    const fullPath = join(answerDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "_generated") continue;
      yield* walkAnswer(fullPath);
    } else {
      if (entry.name === "package.json" || entry.name.endsWith(".ts")) {
        yield fullPath;
      }
    }
  }
}
