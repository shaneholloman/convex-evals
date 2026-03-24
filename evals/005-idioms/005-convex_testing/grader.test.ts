import { expect, test, beforeEach } from "vitest";
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  responseClient,
  responseAdminClient,
  compareSchema,
  deleteAllDocuments,
} from "../../../grader";
import { api } from "./answer/convex/_generated/api";

beforeEach(async () => {
  await deleteAllDocuments(responseAdminClient, ["tasks"]);
});

test("compare schema", async ({ skip }) => {
  await compareSchema(skip);
});

test("create adds a task", async () => {
  const id = await responseClient.mutation(api.tasks.create, {
    text: "Buy groceries",
  });
  expect(id).toBeDefined();
});

test("list returns empty array initially", async () => {
  const tasks = await responseClient.query(api.tasks.list, {});
  expect(tasks).toEqual([]);
});

test("list returns created tasks", async () => {
  await responseClient.mutation(api.tasks.create, { text: "Task A" });
  await responseClient.mutation(api.tasks.create, { text: "Task B" });

  const tasks = await responseClient.query(api.tasks.list, {});
  expect(tasks).toHaveLength(2);
  expect(tasks.map((t: { text: string }) => t.text)).toContain("Task A");
  expect(tasks.map((t: { text: string }) => t.text)).toContain("Task B");
});

test("created tasks start as not completed", async () => {
  await responseClient.mutation(api.tasks.create, { text: "Incomplete task" });
  const tasks = await responseClient.query(api.tasks.list, {});
  expect(tasks[0].isCompleted).toBe(false);
});

test("complete marks a task as completed", async () => {
  const id = await responseClient.mutation(api.tasks.create, {
    text: "Finish project",
  });
  await responseClient.mutation(api.tasks.complete, { id });

  const tasks = await responseClient.query(api.tasks.list, {});
  const task = tasks.find(
    (t: { text: string }) => t.text === "Finish project",
  );
  expect(task).toBeDefined();
  expect(task!.isCompleted).toBe(true);
});

test("remove deletes a task", async () => {
  const id = await responseClient.mutation(api.tasks.create, {
    text: "To be removed",
  });
  await responseClient.mutation(api.tasks.remove, { id });

  const tasks = await responseClient.query(api.tasks.list, {});
  expect(tasks).toHaveLength(0);
});

test("model's convex-test suite passes", () => {
  const outputDir = process.env.MODEL_OUTPUT_DIR;
  if (!outputDir) {
    throw new Error("MODEL_OUTPUT_DIR not set");
  }

  const testFiles = [
    "convex/tasks.test.ts",
    "convex/tasks.test.js",
  ];
  const hasTestFile = testFiles.some((f) =>
    existsSync(join(outputDir, f)),
  );
  expect(hasTestFile).toBe(true);

  expect(existsSync(join(outputDir, "vitest.config.ts"))).toBe(true);

  const vitestBin = join(outputDir, "node_modules", ".bin", "vitest");
  let stdout: string;
  try {
    stdout = execSync(
      `"${vitestBin}" run --reporter=json --no-color 2>&1`,
      {
        cwd: outputDir,
        encoding: "utf-8",
        timeout: 60000,
        shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
      },
    );
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string };
    const output = execErr.stdout ?? execErr.stderr ?? String(err);
    throw new Error(`Model's vitest tests failed:\n${output}`);
  }

  const jsonMatch = stdout.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}/);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]) as {
      numTotalTests?: number;
      numPassedTests?: number;
      numFailedTests?: number;
    };
    expect(parsed.numFailedTests).toBe(0);
    expect(parsed.numPassedTests).toBeGreaterThanOrEqual(1);
  }
});

test("model's vitest config uses edge-runtime", () => {
  const outputDir = process.env.MODEL_OUTPUT_DIR;
  if (!outputDir) {
    throw new Error("MODEL_OUTPUT_DIR not set");
  }

  const configPaths = [
    "vitest.config.ts",
    "vitest.config.js",
    "vitest.config.mts",
  ];
  let configContent: string | null = null;
  for (const p of configPaths) {
    const full = join(outputDir, p);
    if (existsSync(full)) {
      configContent = readFileSync(full, "utf-8");
      break;
    }
  }

  expect(configContent).not.toBeNull();
  expect(configContent!).toContain("edge-runtime");
});
