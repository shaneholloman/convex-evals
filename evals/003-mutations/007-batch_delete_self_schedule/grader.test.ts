import { expect, test, beforeEach } from "vitest";
import {
  addDocuments,
  compareSchema,
  deleteAllDocuments,
  responseAdminClient,
  responseClient,
} from "../../../grader";
import { anyApi } from "convex/server";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";

beforeEach(async () => {
  await deleteAllDocuments(responseAdminClient, ["activityLog"]);
});

test("compare schema", async ({ skip }) => {
  await compareSchema(skip);
});

test("deleteActivityLogs removes entries for the given workspace", async () => {
  await addDocuments(responseAdminClient, "activityLog", [
    { workspaceId: "ws-1", action: "login" },
    { workspaceId: "ws-1", action: "upload" },
    { workspaceId: "ws-1", action: "logout" },
    { workspaceId: "ws-2", action: "login" },
    { workspaceId: "ws-2", action: "download" },
  ]);

  await responseClient.mutation(anyApi.index.deleteActivityLogs, {
    workspaceId: "ws-1",
  });

  // Small delay to allow any scheduled follow-ups to complete
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const ws1 = await responseClient.query(anyApi.index.listActivityLogs ?? anyApi.index.getActivityLogs, {
    workspaceId: "ws-1",
  }).catch(() => null);

  // If the model didn't create a list/get query, check via admin client
  if (ws1 === null) {
    const allDocs = await responseAdminClient.query(
      "_system/frontend/listTableScan" as any,
      { table: "activityLog", limit: 100 },
    );
    const ws1Docs = allDocs.filter((d: any) => d.workspaceId === "ws-1");
    const ws2Docs = allDocs.filter((d: any) => d.workspaceId === "ws-2");
    expect(ws1Docs).toHaveLength(0);
    expect(ws2Docs).toHaveLength(2);
  } else {
    expect(ws1).toHaveLength(0);
  }
});

test("deleteActivityLogs does nothing for a workspace with no entries", async () => {
  await addDocuments(responseAdminClient, "activityLog", [
    { workspaceId: "ws-2", action: "login" },
  ]);

  await responseClient.mutation(anyApi.index.deleteActivityLogs, {
    workspaceId: "ws-1",
  });

  const allDocs = await responseAdminClient.query(
    "_system/frontend/listTableScan" as any,
    { table: "activityLog", limit: 100 },
  );
  expect(allDocs).toHaveLength(1);
  expect(allDocs[0].workspaceId).toBe("ws-2");
});

function getLatestOutputProjectDir(): string {
  const category = "003-mutations";
  const name = "007-batch_delete_self_schedule";
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
        // not this layout
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
          // not this layout
        }
      }
    }
  };

  if (configuredRoot) {
    const configuredDir = join(configuredRoot, "output");
    try {
      addCandidateRoots(configuredDir);
    } catch {
      // fall through
    }
  }

  for (const entry of readdirSync(tmpdir(), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const root = join(tmpdir(), entry.name, "output");
    try {
      addCandidateRoots(root);
    } catch {
      // not an eval output dir
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

function containsSchedulerCall(sourceText: string, fileName: string): boolean {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let found = false;

  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === "runAfter"
    ) {
      const expr = node.expression;
      if (
        ts.isPropertyAccessExpression(expr) &&
        expr.name.text === "scheduler"
      ) {
        found = true;
        return;
      }
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === "runAt"
    ) {
      const expr = node.expression;
      if (
        ts.isPropertyAccessExpression(expr) &&
        expr.name.text === "scheduler"
      ) {
        found = true;
        return;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

test("generated solution uses ctx.scheduler to self-schedule for batch processing", () => {
  const outputProjectDir = getLatestOutputProjectDir();
  const indexPath = join(outputProjectDir, "convex", "index.ts");
  const sourceText = readFileSync(indexPath, "utf8");

  expect(containsSchedulerCall(sourceText, indexPath)).toBe(true);
});
