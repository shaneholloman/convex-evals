#!/usr/bin/env bun
/**
 * Validate canonical eval answers by running the normal scoring pipeline
 * in answer mode (no model generation).
 *
 * Usage:
 *   bun run scripts/validateAnswers.ts
 *
 * Environment variables:
 *   TEST_FILTER      - regex to filter evals by "category/name"
 *   OUTPUT_TEMPDIR   - output directory (default: OS temp dir)
 *   EVALS_EXPERIMENT - optional experiment tag for reporting
 *   CONVEX_EVAL_URL / CONVEX_AUTH_TOKEN - optional Convex reporting
 */
import { join } from "path";
import { tmpdir } from "os";
import { config } from "dotenv";

import { runAnswerValidation } from "../runner/index.js";
import { closeClient } from "../runner/reporting.js";

config(); // Load .env

const WINDOWS_SKIPPED_EVALS = ["004-actions/006-node"];

function parseTestFilter(): RegExp | undefined {
  const filter = process.env.TEST_FILTER;
  if (!filter) return undefined;
  try {
    return new RegExp(filter);
  } catch (error) {
    throw new Error(`Invalid TEST_FILTER regex "${filter}": ${String(error)}`);
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyWindowsSkipFilter(testFilter: RegExp | undefined): RegExp | undefined {
  if (process.platform !== "win32") return testFilter;

  const skipped = WINDOWS_SKIPPED_EVALS.map(escapeRegex).join("|");
  const exclusionPrefix = `^(?!(?:${skipped})$)`;

  if (!testFilter) {
    return new RegExp(`${exclusionPrefix}.+`);
  }

  return new RegExp(`${exclusionPrefix}${testFilter.source}`, testFilter.flags);
}

async function main(): Promise<void> {
  const requestedTestFilter = parseTestFilter();
  const testFilter = applyWindowsSkipFilter(requestedTestFilter);
  const tempdir =
    process.env.OUTPUT_TEMPDIR ?? join(tmpdir(), `convex-evals-${Date.now()}`);

  if (process.platform === "win32") {
    console.warn(
      `[validate:answers] Windows local backend limitation detected, skipping: ${WINDOWS_SKIPPED_EVALS.join(", ")}. Run this eval in Linux/CI for authoritative results.`,
    );
  }

  await runAnswerValidation({
    tempdir,
    testFilter,
    customGuidelinesPath: process.env.CUSTOM_GUIDELINES_PATH,
    convexEvalUrl: process.env.CONVEX_EVAL_URL,
    convexAuthToken: process.env.CONVEX_AUTH_TOKEN,
    experiment: process.env.EVALS_EXPERIMENT,
  });

  await closeClient();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
