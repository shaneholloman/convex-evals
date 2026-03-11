import { expect, test, beforeEach } from "vitest";
import {
  deleteAllDocuments,
  getSchema,
  responseAdminClient,
  responseClient,
} from "../../../grader";
import { anyApi } from "convex/server";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";

beforeEach(async () => {
  const schema = await getSchema(responseAdminClient);
  if (schema && Array.isArray(schema.tables)) {
    const tableNames = schema.tables.map((t: any) => t.tableName);
    await deleteAllDocuments(responseAdminClient, tableNames);
  }
});

test("getTicketCount returns 0 for an org with no tickets", async () => {
  const count = await responseClient.query(
    anyApi.index.getTicketCount,
    { orgId: "org-1" },
  );

  expect(count).toBe(0);
});

test("getTicketCount returns the correct count after creating tickets", async () => {
  await responseClient.mutation(anyApi.index.createTicket, {
    orgId: "org-1",
    title: "Fix login bug",
    status: "open",
  });
  await responseClient.mutation(anyApi.index.createTicket, {
    orgId: "org-1",
    title: "Add dark mode",
    status: "open",
  });
  await responseClient.mutation(anyApi.index.createTicket, {
    orgId: "org-1",
    title: "Update docs",
    status: "closed",
  });

  const count = await responseClient.query(
    anyApi.index.getTicketCount,
    { orgId: "org-1" },
  );

  expect(count).toBe(3);
});

test("getTicketCount returns independent counts per org", async () => {
  await responseClient.mutation(anyApi.index.createTicket, {
    orgId: "org-1",
    title: "Ticket A",
    status: "open",
  });
  await responseClient.mutation(anyApi.index.createTicket, {
    orgId: "org-1",
    title: "Ticket B",
    status: "open",
  });
  await responseClient.mutation(anyApi.index.createTicket, {
    orgId: "org-2",
    title: "Ticket C",
    status: "open",
  });

  const countOrg1 = await responseClient.query(
    anyApi.index.getTicketCount,
    { orgId: "org-1" },
  );
  const countOrg2 = await responseClient.query(
    anyApi.index.getTicketCount,
    { orgId: "org-2" },
  );
  const countOrg3 = await responseClient.query(
    anyApi.index.getTicketCount,
    { orgId: "org-3" },
  );

  expect(countOrg1).toBe(2);
  expect(countOrg2).toBe(1);
  expect(countOrg3).toBe(0);
});

function getLatestOutputProjectDir(): string {
  const category = "002-queries";
  const name = "023-count_without_collect";
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

test("generated solution does not use .collect() in convex/index.ts", () => {
  const outputProjectDir = getLatestOutputProjectDir();
  const indexPath = join(outputProjectDir, "convex", "index.ts");
  const sourceText = readFileSync(indexPath, "utf8");

  expect(containsCollectCall(sourceText, indexPath)).toBe(false);
});
