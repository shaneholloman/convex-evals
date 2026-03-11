import { expect, test, beforeEach } from "vitest";
import {
  addDocuments,
  compareFunctionSpec,
  compareSchema,
  deleteAllDocuments,
  responseAdminClient,
  responseClient,
} from "../../../grader";
import { api } from "./answer/convex/_generated/api";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";

beforeEach(async () => {
  await deleteAllDocuments(responseAdminClient, ["auditLogs"]);
});

test("compare schema", async ({ skip }) => {
  await compareSchema(skip);
});

test("compare function spec", async ({ skip }) => {
  await compareFunctionSpec(skip);
});

test("listAuditLogs returns an empty array for an empty workspace", async () => {
  const result = await responseClient.query(api.index.listAuditLogs, {
    workspaceId: "workspace-1",
  });

  expect(result).toEqual([]);
});

test("listAuditLogs filters to one workspace and orders newest first", async () => {
  await addDocuments(responseAdminClient, "auditLogs", [
    {
      workspaceId: "workspace-1",
      actor: "alice",
      action: "created project",
    },
    {
      workspaceId: "workspace-2",
      actor: "bob",
      action: "deleted file",
    },
    {
      workspaceId: "workspace-1",
      actor: "carol",
      action: "updated settings",
    },
    {
      workspaceId: "workspace-1",
      actor: "dave",
      action: "invited teammate",
    },
  ]);

  const result = await responseClient.query(api.index.listAuditLogs, {
    workspaceId: "workspace-1",
  });

  expect(result).toHaveLength(3);
  expect(result.map((entry) => entry.action)).toEqual([
    "invited teammate",
    "updated settings",
    "created project",
  ]);
  expect(result.every((entry) => entry.workspaceId === "workspace-1")).toBe(
    true,
  );
});

test("listAuditLogs returns at most 100 results", async () => {
  await addDocuments(
    responseAdminClient,
    "auditLogs",
    Array.from({ length: 105 }, (_, i) => ({
      workspaceId: "workspace-1",
      actor: `actor-${i}`,
      action: `action-${i}`,
    })),
  );

  const result = await responseClient.query(api.index.listAuditLogs, {
    workspaceId: "workspace-1",
  });

  expect(result).toHaveLength(100);
  expect(result[0].action).toBe("action-104");
  expect(result[99].action).toBe("action-5");
});

test("listAuditLogs includes system fields", async () => {
  await addDocuments(responseAdminClient, "auditLogs", [
    {
      workspaceId: "workspace-1",
      actor: "alice",
      action: "created project",
    },
  ]);

  const [result] = await responseClient.query(api.index.listAuditLogs, {
    workspaceId: "workspace-1",
  });

  expect(result._id).toBeDefined();
  expect(result._creationTime).toBeTypeOf("number");
});

function getLatestOutputProjectDir(): string {
  const category = "002-queries";
  const name = "022-unbounded_query_no_collect";
  const configuredRoot = process.env.OUTPUT_TEMPDIR;
  const candidateRoots: { dir: string; mtime: number }[] = [];
  const currentPort = process.env.CONVEX_PORT;

  const addCandidateRoots = (outputRoot: string) => {
    for (const providerDir of readdirSync(outputRoot, { withFileTypes: true })) {
      if (!providerDir.isDirectory()) continue;

      const providerPath = join(outputRoot, providerDir.name);
      const oneLevelProjectDir = join(providerPath, category, name);
      try {
        const st = statSync(oneLevelProjectDir);
        if (st.isDirectory()) {
          candidateRoots.push({ dir: oneLevelProjectDir, mtime: st.mtimeMs });
        }
      } catch {
        // Ignore layouts that include an extra model directory.
      }

      for (const modelDir of readdirSync(providerPath, { withFileTypes: true })) {
        if (!modelDir.isDirectory()) continue;

        const projectDir = join(providerPath, modelDir.name, category, name);
        try {
          const st = statSync(projectDir);
          if (st.isDirectory()) {
            candidateRoots.push({ dir: projectDir, mtime: st.mtimeMs });
          }
        } catch {
          // Ignore non-matching output directories.
        }
      }
    }
  };

  if (configuredRoot) {
    const configuredDir = join(configuredRoot, "output");
    try {
      addCandidateRoots(configuredDir);
    } catch {
      // Fall back to scanning the OS tempdir below.
    }
  }

  for (const entry of readdirSync(tmpdir(), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const root = join(tmpdir(), entry.name, "output");
    try {
      addCandidateRoots(root);
    } catch {
      // Ignore directories that do not contain eval output.
    }
  }

  if (candidateRoots.length === 0) {
    throw new Error(`Could not find generated output for ${category}/${name}`);
  }

  if (currentPort) {
    const matchingCurrentRun = candidateRoots.filter(({ dir }) => {
      try {
        const envLocal = readFileSync(join(dir, ".env.local"), "utf8");
        return envLocal.includes(`CONVEX_URL=http://localhost:${currentPort}`);
      } catch {
        return false;
      }
    });

    if (matchingCurrentRun.length > 0) {
      matchingCurrentRun.sort((a, b) => b.mtime - a.mtime);
      return matchingCurrentRun[0].dir;
    }
  }

  candidateRoots.sort((a, b) => b.mtime - a.mtime);
  return candidateRoots[0].dir;
}

function containsCollectCall(sourceText: string, fileName: string): boolean {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let foundCollect = false;

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "collect"
    ) {
      foundCollect = true;
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return foundCollect;
}

test("generated solution does not use collect in convex/index.ts", () => {
  // See README.md for why this eval treats `.collect()` as the wrong default
  // for a plain list-style query unless the task explicitly asks for the full set.
  const outputProjectDir = getLatestOutputProjectDir();
  const indexPath = join(outputProjectDir, "convex", "index.ts");
  const sourceText = readFileSync(indexPath, "utf8");

  expect(containsCollectCall(sourceText, indexPath)).toBe(false);
});
