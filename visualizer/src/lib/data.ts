import { createServerFn } from "@tanstack/react-start";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { EvalResult, FileEntry, ConvexModelScore, ConvexRun } from "./types";

// Convex evalScores endpoint (use dev deployment for local testing)
const CONVEX_BASE_URL =
  process.env.CONVEX_SITE_URL || "https://brazen-pelican-414.convex.site";

const CONVEX_SCORES_URL = `${CONVEX_BASE_URL}/listScores`;
const CONVEX_RUNS_URL = `${CONVEX_BASE_URL}/listRuns`;

// Get the project root (one level up from visualizer)
function getProjectRoot(): string {
  return resolve(process.cwd(), "..");
}

function getResultsPath(): string {
  return resolve(getProjectRoot(), "local_results.jsonl");
}

export const getResults = createServerFn().handler(
  async (): Promise<EvalResult[]> => {
    const resultsPath = getResultsPath();

    if (!existsSync(resultsPath)) {
      throw new Error(`Results file not found: ${resultsPath}`);
    }

    const content = readFileSync(resultsPath, { encoding: "utf-8" });
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

    return lines.map((line) => {
      try {
        return JSON.parse(line) as EvalResult;
      } catch (err) {
        console.warn(`Failed to parse line: ${line}`);
        throw err;
      }
    });
  },
);

export const getTaskContent = createServerFn().handler(
  async (ctx: {
    data: { category: string; evalName: string };
  }): Promise<string> => {
    const { category, evalName } = ctx.data;
    const taskPath = join(
      getProjectRoot(),
      "evals",
      category,
      evalName,
      "TASK.txt",
    );

    if (!existsSync(taskPath)) {
      throw new Error("Task file not found");
    }

    return readFileSync(taskPath, { encoding: "utf-8" });
  },
);

export const getLogContent = createServerFn().handler(
  async (ctx: { data: { logPath: string } }): Promise<string> => {
    const { logPath } = ctx.data;

    if (!existsSync(logPath)) {
      throw new Error("Log file not found");
    }

    return readFileSync(logPath, { encoding: "utf-8" });
  },
);

export const browseDirectory = createServerFn().handler(
  async (ctx: { data: { dirPath: string } }): Promise<FileEntry[]> => {
    const { dirPath } = ctx.data;

    if (!existsSync(dirPath)) {
      throw new Error("Directory not found");
    }

    const items = readdirSync(dirPath, { withFileTypes: true });
    return items.map((item) => ({
      name: item.name,
      isDirectory: item.isDirectory(),
      path: join(dirPath, item.name),
    }));
  },
);

export const getFileContent = createServerFn().handler(
  async (ctx: { data: { filePath: string } }): Promise<string> => {
    const { filePath } = ctx.data;

    if (!existsSync(filePath)) {
      throw new Error("File not found");
    }

    return readFileSync(filePath, { encoding: "utf-8" });
  },
);

export const getAnswerDirectory = createServerFn().handler(
  async (ctx: {
    data: { category: string; evalName: string };
  }): Promise<FileEntry[]> => {
    const { category, evalName } = ctx.data;
    const answerPath = join(
      getProjectRoot(),
      "evals",
      category,
      evalName,
      "answer",
    );

    if (!existsSync(answerPath)) {
      return [];
    }

    const items = readdirSync(answerPath, { withFileTypes: true });
    return items.map((item) => ({
      name: item.name,
      isDirectory: item.isDirectory(),
      path: join(answerPath, item.name),
    }));
  },
);

export const getAnswerFileContent = createServerFn().handler(
  async (ctx: {
    data: { category: string; evalName: string; fileName: string };
  }): Promise<string> => {
    const { category, evalName, fileName } = ctx.data;
    const filePath = join(
      getProjectRoot(),
      "evals",
      category,
      evalName,
      "answer",
      fileName,
    );

    if (!existsSync(filePath)) {
      throw new Error("File not found");
    }

    return readFileSync(filePath, { encoding: "utf-8" });
  },
);

export const getConvexScores = createServerFn().handler(
  async (): Promise<ConvexModelScore[]> => {
    const response = await fetch(CONVEX_SCORES_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch scores: ${response.status}`);
    }
    return response.json();
  },
);

export const getConvexRuns = createServerFn().handler(
  async (ctx: { data?: { experiment?: string; includeAll?: boolean; limit?: number } }): Promise<ConvexRun[]> => {
    const { experiment, includeAll, limit } = ctx.data || {};
    const url = new URL(CONVEX_RUNS_URL);
    if (includeAll) {
      url.searchParams.set("includeAll", "true");
    } else if (experiment) {
      url.searchParams.set("experiment", experiment);
    }
    if (limit) {
      url.searchParams.set("limit", String(limit));
    }
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Failed to fetch runs: ${response.status}`);
    }
    return response.json();
  },
);
