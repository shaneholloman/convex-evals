#!/usr/bin/env bun
/**
 * Interactive CLI for running Convex evals.
 * Run with: bun run scripts/runEvals.ts
 * Or use: bun run evals (after adding to package.json)
 */

import { Command } from "commander";
import { select, checkbox, confirm, input } from "@inquirer/prompts";
import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { ALL_MODELS } from "../runner/models/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface EvalResult {
  category: string;
  name: string;
  passed: boolean;
  tests_pass_score: number;
  failure_reason: string | null;
  directory_path: string;
}

interface RunResult {
  model_name: string;
  tempdir: string;
  individual_results: EvalResult[];
  run_stats: {
    total_tests: number;
    total_passed: number;
    total_failed: number;
    overall_score: number;
  };
}

interface CategoryInfo {
  name: string;
  displayName: string;
  evals: EvalInfo[];
}

interface EvalInfo {
  name: string;
  fullPath: string;
  category: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const EVALS_DIR = "evals";
const LOCAL_RESULTS_FILE = "local_results.jsonl";
const DEFAULT_MODEL = "claude-sonnet-4-5";

// Valid experiment values
const VALID_EXPERIMENTS = ["no_guidelines"] as const;
type Experiment = (typeof VALID_EXPERIMENTS)[number];

interface ModelChoice {
  name: string;
  value: string;
  provider: string;
}

/**
 * Discover available models directly from TypeScript model definitions.
 */
function discoverModels(): ModelChoice[] {
  return ALL_MODELS.map((m) => ({
    name: m.formattedName,
    value: m.name,
    provider: m.provider,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDisplayName(dirName: string): string {
  const withoutPrefix = dirName.replace(/^\d+-/, "");
  return withoutPrefix
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatProviderName(provider: string): string {
  const providerNames: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    together: "Together",
    google: "Google",
    xai: "xAI",
    moonshot: "Moonshot",
  };
  return providerNames[provider] ?? provider;
}

// ─────────────────────────────────────────────────────────────────────────────
// Discovery Functions
// ─────────────────────────────────────────────────────────────────────────────

async function discoverCategories(): Promise<CategoryInfo[]> {
  const categories: CategoryInfo[] = [];
  const entries = await readdir(EVALS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const categoryPath = join(EVALS_DIR, entry.name);
    const evals = await discoverEvalsInCategory(entry.name, categoryPath);

    categories.push({
      name: entry.name,
      displayName: formatDisplayName(entry.name),
      evals,
    });
  }

  categories.sort((a, b) => a.name.localeCompare(b.name));
  return categories;
}

async function discoverEvalsInCategory(
  categoryName: string,
  categoryPath: string,
): Promise<EvalInfo[]> {
  const evals: EvalInfo[] = [];
  const entries = await readdir(categoryPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const evalPath = join(categoryPath, entry.name);
    const taskFile = join(evalPath, "TASK.txt");

    try {
      await stat(taskFile);
      evals.push({
        name: entry.name,
        fullPath: `${categoryName}/${entry.name}`,
        category: categoryName,
      });
    } catch {
      // No TASK.txt, skip
    }
  }

  evals.sort((a, b) => a.name.localeCompare(b.name));
  return evals;
}

// ─────────────────────────────────────────────────────────────────────────────
// Results Parsing
// ─────────────────────────────────────────────────────────────────────────────

async function getLastRunResults(): Promise<RunResult | null> {
  try {
    const content = await readFile(LOCAL_RESULTS_FILE, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return null;

    const lastLine = lines[lines.length - 1];
    return JSON.parse(lastLine) as RunResult;
  } catch {
    return null;
  }
}

async function getFailedEvals(): Promise<string[]> {
  const lastRun = await getLastRunResults();
  if (!lastRun) return [];

  return lastRun.individual_results
    .filter((r) => !r.passed)
    .map((r) => `${r.category}/${r.name}`);
}

async function getLastRunSummary(): Promise<string | null> {
  const lastRun = await getLastRunResults();
  if (!lastRun) return null;

  const { run_stats, model_name } = lastRun;
  const passRate = (run_stats.overall_score * 100).toFixed(1);
  return `${model_name}: ${run_stats.total_passed}/${run_stats.total_tests} passed (${passRate}%)`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Run Execution
// ─────────────────────────────────────────────────────────────────────────────

interface RunOptions {
  models: string[];
  filter?: string;
  verbose: boolean;
  outputTempdir?: string;
  postToConvex: boolean;
  experiment?: Experiment;
}

function isConvexPostingConfigured(): boolean {
  return Boolean(process.env.CONVEX_EVAL_ENDPOINT && process.env.CONVEX_AUTH_TOKEN);
}

function buildEnvVars(options: RunOptions): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;

  if (options.models.length > 0) {
    env.MODELS = options.models.join(",");
  }

  if (options.filter) {
    env.TEST_FILTER = options.filter;
  }

  if (options.verbose) {
    env.VERBOSE_INFO_LOGS = "1";
  }

  if (options.postToConvex) {
    env.POST_TO_CONVEX = "1";
  }

  if (options.experiment) {
    env.EVALS_EXPERIMENT = options.experiment;
  }

  env.LOCAL_RESULTS = LOCAL_RESULTS_FILE;

  if (options.outputTempdir) {
    env.OUTPUT_TEMPDIR = options.outputTempdir;
  }

  return env;
}

async function runEvals(options: RunOptions): Promise<void> {
  const env = buildEnvVars(options);

  console.log(
    "\n┌─────────────────────────────────────────────────────────────┐",
  );
  console.log(
    "│                    Running Convex Evals                     │",
  );
  console.log(
    "└─────────────────────────────────────────────────────────────┘\n",
  );

  console.log("Configuration:");
  console.log(`  Models: ${options.models.join(", ") || "(default)"}`);
  console.log(`  Filter: ${options.filter || "(all)"}`);
  console.log(`  Experiment: ${options.experiment || "(none)"}`);
  console.log(
    `  Post to Convex: ${options.postToConvex ? "yes" : "no"}${options.postToConvex && !isConvexPostingConfigured() ? " (warning: CONVEX_EVAL_ENDPOINT or CONVEX_AUTH_TOKEN not set)" : ""}`,
  );
  console.log(`  Verbose: ${options.verbose ? "yes" : "no"}`);
  console.log("");

  const child = spawn("bun", ["run", "runner/index.ts"], {
    env,
    stdio: "inherit",
    shell: true,
  });

  return new Promise((resolve, reject) => {
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Eval run exited with code ${code}`));
      }
    });
    child.on("error", reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Interactive Mode
// ─────────────────────────────────────────────────────────────────────────────

const BACK = Symbol("back");

type SelectResult<T> = T | typeof BACK;

async function selectFilter(
  categories: CategoryInfo[],
  failedEvals: string[],
): Promise<SelectResult<string | undefined>> {
  const action = await select({
    message: "What would you like to run?",
    choices: [
      { name: "Run all evals", value: "all" },
      { name: "Select categories to run", value: "categories" },
      { name: "Select specific evals", value: "evals" },
      ...(failedEvals.length > 0
        ? [
            {
              name: `Re-run last failed (${failedEvals.length} evals)`,
              value: "failed",
            },
          ]
        : []),
      { name: "Run single eval by path", value: "single" },
      { name: "← Back", value: "back" },
    ],
  });

  if (action === "back") return BACK;
  if (action === "all") return undefined;

  if (action === "categories") {
    const selectedCategories = await checkbox({
      message: "Select categories to run (space to toggle, enter to confirm):",
      choices: categories.map((c) => ({
        name: `${c.displayName} (${c.evals.length} evals)`,
        value: c.name,
      })),
    });

    if (selectedCategories.length === 0) return BACK;
    return selectedCategories.join("|");
  }

  if (action === "evals") {
    const allEvals = categories.flatMap((c) =>
      c.evals.map((e) => ({
        name: `[${c.displayName}] ${e.name}`,
        value: e.fullPath,
      })),
    );

    const selectedEvals = await checkbox({
      message: "Select evals to run (space to toggle, enter to confirm):",
      choices: allEvals,
      pageSize: 20,
    });

    if (selectedEvals.length === 0) return BACK;
    return selectedEvals.join("|");
  }

  if (action === "failed") {
    if (failedEvals.length === 0) return BACK;
    console.log(`\nRe-running ${failedEvals.length} failed evals:`);
    failedEvals.forEach((e) => console.log(`  - ${e}`));
    return failedEvals.join("|");
  }

  if (action === "single") {
    const evalPath = await input({
      message: "Enter eval path (e.g., 000-fundamentals/000-empty_functions):",
    });

    if (!evalPath.trim()) return BACK;
    return evalPath.trim();
  }

  return BACK;
}

async function selectModels(): Promise<SelectResult<string[]>> {
  const modelChoice = await select({
    message: "Select model(s):",
    choices: [
      { name: "Claude 4.5 Sonnet (default)", value: DEFAULT_MODEL },
      { name: "Choose from list", value: "choose" },
      { name: "← Back", value: "back" },
    ],
  });

  if (modelChoice === "back") return BACK;

  if (modelChoice === "choose") {
    const availableModels = discoverModels();
    const selected = await checkbox({
      message: "Select models (space to toggle, enter to confirm):",
      choices: availableModels.map((m) => ({ name: m.name, value: m.value })),
      pageSize: 15,
    });

    if (selected.length === 0) {
      console.log("\nNo models selected, going back.\n");
      return BACK;
    }
    return selected;
  }

  return [modelChoice];
}

async function selectExperiment(): Promise<SelectResult<Experiment | undefined>> {
  const choice = await select({
    message: "Run an experiment?",
    choices: [
      { name: "No experiment (use guidelines)", value: "none" },
      { name: "no_guidelines (skip Convex guidelines)", value: "no_guidelines" },
      { name: "← Back", value: "back" },
    ],
  });

  if (choice === "back") return BACK;
  if (choice === "none") return undefined;
  return choice as Experiment;
}

async function selectOptions(): Promise<
  SelectResult<{ verbose: boolean; postToConvex: boolean; experiment?: Experiment }>
> {
  const experiment = await selectExperiment();
  if (experiment === BACK) return BACK;

  // Only ask about Convex posting if the env vars are configured
  let postToConvex = false;
  if (isConvexPostingConfigured()) {
    postToConvex = await confirm({
      message: "Post results to Convex database?",
      default: true,
    });
  }

  const verbose = await confirm({
    message: "Enable verbose logging?",
    default: true,
  });

  return { verbose, postToConvex, experiment };
}

interface LastRunConfig {
  models: string[];
  filter: string | undefined;
  verbose: boolean;
  postToConvex: boolean;
  experiment?: Experiment;
}

function formatRunConfigSummary(config: LastRunConfig): string {
  const parts: string[] = [];
  parts.push(`Models: ${config.models.join(", ") || "(default)"}`);
  parts.push(`Filter: ${config.filter || "(all)"}`);
  return parts.join(", ");
}

async function interactiveMode(): Promise<void> {
  console.log("\n Convex Evals Runner\n");

  const lastRunSummary = await getLastRunSummary();
  if (lastRunSummary) {
    console.log(`Last run: ${lastRunSummary}\n`);
  }

  const categories = await discoverCategories();
  let failedEvals = await getFailedEvals();
  let lastRunConfig: LastRunConfig | null = null;

  while (true) {
    const menuChoices = [
      { name: "Run evals", value: "run" },
      ...(lastRunConfig
        ? [{ name: "Run again", value: "run-again" }]
        : []),
      { name: "View status", value: "status" },
      { name: "List available evals", value: "list" },
      { name: "Exit", value: "exit" },
    ];

    const mainAction = await select({
      message: "What would you like to do?",
      choices: menuChoices,
    });

    if (mainAction === "exit") {
      console.log("Goodbye!\n");
      return;
    }

    if (mainAction === "status") {
      const lastRun = await getLastRunResults();
      if (!lastRun) {
        console.log("\nNo previous run results found.\n");
        continue;
      }

      const { run_stats, model_name, individual_results } = lastRun;
      console.log(`\nModel: ${model_name}`);
      console.log(`Score: ${(run_stats.overall_score * 100).toFixed(1)}%`);
      console.log(
        `Passed: ${run_stats.total_passed}/${run_stats.total_tests}\n`,
      );

      for (const result of individual_results) {
        const status = result.passed ? "PASS" : "FAIL";
        const score = (result.tests_pass_score * 100).toFixed(0);
        const reason = result.failure_reason
          ? ` (${result.failure_reason})`
          : "";
        console.log(
          `  [${status}] ${result.category}/${result.name} - ${score}%${reason}`,
        );
      }
      console.log("");
      continue;
    }

    if (mainAction === "list") {
      console.log("\nAvailable Evals\n");
      for (const category of categories) {
        console.log(`${category.displayName} (${category.name})`);
        for (const evalInfo of category.evals) {
          console.log(`  - ${evalInfo.name}`);
        }
        console.log("");
      }
      continue;
    }

    if (mainAction === "run-again" && lastRunConfig) {
      const runAgainChoice = await select({
        message: "Run again:",
        choices: [
          {
            name: `With same values (${formatRunConfigSummary(lastRunConfig)})`,
            value: "same",
          },
          { name: "Change values", value: "change" },
          { name: "Back", value: "back" },
        ],
      });

      if (runAgainChoice === "back") continue;

      if (runAgainChoice === "same") {
        try {
          await runEvals({
            models: lastRunConfig.models,
            filter: lastRunConfig.filter,
            verbose: lastRunConfig.verbose,
            postToConvex: lastRunConfig.postToConvex,
            experiment: lastRunConfig.experiment,
          });
          failedEvals = await getFailedEvals();
        } catch (error) {
          console.error("\nEval run failed:", error);
        }
        continue;
      }
    }

    const filter = await selectFilter(categories, failedEvals);
    if (filter === BACK) continue;

    const models = await selectModels();
    if (models === BACK) continue;

    const options = await selectOptions();
    if (options === BACK) continue;

    const shouldRun = await confirm({
      message: "Ready to run. Proceed?",
      default: true,
    });

    if (!shouldRun) {
      console.log("Cancelled.\n");
      continue;
    }

    lastRunConfig = {
      models,
      filter,
      verbose: options.verbose,
      postToConvex: options.postToConvex,
      experiment: options.experiment,
    };

    try {
      await runEvals({
        models,
        filter,
        verbose: options.verbose,
        postToConvex: options.postToConvex,
        experiment: options.experiment,
      });
      failedEvals = await getFailedEvals();
    } catch (error) {
      console.error("\nEval run failed:", error);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI Setup
// ─────────────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("evals")
  .description("Interactive CLI for running Convex evals")
  .version("1.0.0");

program
  .command("run", { isDefault: true })
  .description("Run evals (interactive mode if no options provided)")
  .option("-m, --model <models...>", "Model(s) to use")
  .option("-f, --filter <pattern>", "Filter evals by regex pattern")
  .option("-c, --category <categories...>", "Run specific categories")
  .option("--failed", "Re-run only failed evals from last run")
  .option("-e, --experiment <name>", `Run an experiment (${VALID_EXPERIMENTS.join(", ")})`)
  .option("--post-to-convex", "Post results to Convex database")
  .option("-v, --verbose", "Enable verbose logging", true)
  .option("--no-verbose", "Disable verbose logging")
  .option("-o, --output <dir>", "Output directory for results")
  .action(async (options) => {
    if (options.experiment && !VALID_EXPERIMENTS.includes(options.experiment)) {
      console.error(`Invalid experiment: ${options.experiment}`);
      console.error(`Valid experiments: ${VALID_EXPERIMENTS.join(", ")}`);
      process.exit(1);
    }

    const hasFilterOptions =
      options.model || options.filter || options.category || options.failed;

    if (!hasFilterOptions && !options.experiment) {
      await interactiveMode();
      return;
    }

    let filter: string | undefined = options.filter;

    if (options.category) {
      filter = options.category.join("|");
    }

    if (options.failed) {
      const failedEvals = await getFailedEvals();
      if (failedEvals.length === 0) {
        console.log("No failed evals to re-run.");
        return;
      }
      filter = failedEvals.join("|");
      console.log(`Re-running ${failedEvals.length} failed evals`);
    }

    await runEvals({
      models: options.model || [],
      filter,
      verbose: options.verbose,
      outputTempdir: options.output,
      postToConvex: options.postToConvex || false,
      experiment: options.experiment,
    });
  });

program
  .command("list")
  .description("List available evals")
  .option("-c, --category <category>", "Filter by category")
  .action(async (options) => {
    const categories = await discoverCategories();

    console.log("\nAvailable Evals\n");

    for (const category of categories) {
      if (options.category && category.name !== options.category) continue;

      console.log(`${category.displayName} (${category.name})`);
      for (const evalInfo of category.evals) {
        console.log(`  - ${evalInfo.name}`);
      }
      console.log("");
    }

    const totalEvals = categories.reduce((sum, c) => sum + c.evals.length, 0);
    console.log(
      `Total: ${totalEvals} evals in ${categories.length} categories\n`,
    );
  });

program
  .command("status")
  .description("Show last run results")
  .option("--failed", "Show only failed evals")
  .action(async (options) => {
    const lastRun = await getLastRunResults();

    if (!lastRun) {
      console.log("\nNo previous run results found.\n");
      return;
    }

    const { run_stats, model_name, individual_results, tempdir } = lastRun;

    console.log("\nLast Run Status\n");
    console.log(`Model: ${model_name}`);
    console.log(`Output: ${tempdir}`);
    console.log(`Score: ${(run_stats.overall_score * 100).toFixed(1)}%`);
    console.log(`Passed: ${run_stats.total_passed}/${run_stats.total_tests}`);
    console.log("");

    const resultsToShow = options.failed
      ? individual_results.filter((r) => !r.passed)
      : individual_results;

    if (options.failed && resultsToShow.length === 0) {
      console.log("All evals passed!\n");
      return;
    }

    console.log(options.failed ? "Failed Evals:" : "Results:");
    for (const result of resultsToShow) {
      const status = result.passed ? "PASS" : "FAIL";
      const score = (result.tests_pass_score * 100).toFixed(0);
      const reason = result.failure_reason ? ` (${result.failure_reason})` : "";
      console.log(
        `  [${status}] ${result.category}/${result.name} - ${score}%${reason}`,
      );
    }
    console.log("");
  });

program
  .command("models")
  .description("List available models")
  .action(async () => {
    const availableModels = discoverModels();

    console.log("\nAvailable Models\n");

    const byProvider: Record<string, ModelChoice[]> = {};
    for (const model of availableModels) {
      const providerName = formatProviderName(model.provider);
      byProvider[providerName] = byProvider[providerName] || [];
      byProvider[providerName].push(model);
    }

    for (const [provider, models] of Object.entries(byProvider)) {
      console.log(`${provider}:`);
      for (const model of models) {
        console.log(`  - ${model.name} (${model.value})`);
      }
      console.log("");
    }
  });

program.parse();
