import { ConvexClient } from "convex/browser";
import { expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

const responsePortStr = process.env.CONVEX_PORT;
if (!responsePortStr) {
  throw new Error("CONVEX_PORT is not set");
}
const responsePort = Number(responsePortStr);

// Use the explicitly-provided site proxy port when available, falling back to
// port + 1 for backwards compatibility.  Always use `localhost` (not 0.0.0.0)
// because 0.0.0.0 is not a valid outbound destination on Windows.
const sitePort = process.env.CONVEX_SITE_PORT
  ? Number(process.env.CONVEX_SITE_PORT)
  : responsePort + 1;

export const cloudUrl = `http://localhost:${responsePort}`;
export const siteUrl = `http://localhost:${sitePort}`;

const answerPort = process.env.CONVEX_ANSWER_PORT;

export const responseClient = new ConvexClient(cloudUrl);

const adminKey =
  "0135d8598650f8f5cb0f30c34ec2e2bb62793bc28717c8eb6fb577996d50be5f4281b59181095065c5d0f86a2c31ddbe9b597ec62b47ded69782cd";
export const responseAdminClient = new ConvexClient(
  `http://localhost:${responsePort}`,
);
(responseAdminClient as any).setAdminAuth(adminKey);

let answerAdminClient: ConvexClient | null = null;
if (answerPort) {
  answerAdminClient = new ConvexClient(`http://localhost:${answerPort}`);
  (answerAdminClient as any).setAdminAuth(adminKey);
}

export async function getSchema(adminClient: any) {
  const result = await adminClient.query("_system/frontend/getSchemas" as any, {
    componentId: null,
  });
  if (!result.active) {
    return null;
  }
  const schema = JSON.parse(result.active);
  schema.tables.sort((a: any, b: any) =>
    a.tableName.localeCompare(b.tableName),
  );
  return schema;
}

/**
 * Insert the given documents into a table.
 */
export async function addDocuments(
  adminClient: any,
  table: string,
  documents: any[],
): Promise<void> {
  const result = await adminClient.mutation("_system/frontend/addDocument", {
    table,
    documents,
  });
  if (!result.success) {
    throw new Error(result.error);
  }
}

/**
 * List the given table, returning the results in ascending creation time order.
 */
export async function listTable(
  adminClient: any,
  table: string,
  limit: number = 32,
): Promise<any[]> {
  const result: any[] = await adminClient.query(
    "_system/frontend/listTableScan",
    {
      table,
      limit,
    },
  );
  result.reverse();
  return result;
}

export async function deleteAllDocuments(adminClient: any, tables: string[]) {
  const totalDeleted: Record<string, number> = {};
  for (const tableName of tables) {
    // We need to check if the table is empty before trying to delete it. It is possible for empty tables
    // to not have the `by_create_time` index, which will cause the `clearTablePage` mutation to fail.
    const docs = await listTable(responseAdminClient, tableName);
    if (docs.length > 0) {
      let { deleted, continueCursor, hasMore } = await adminClient.mutation(
        "_system/frontend/clearTablePage",
        { tableName, cursor: null },
      );
      totalDeleted[tableName] = deleted;
      while (hasMore) {
        ({ deleted, continueCursor, hasMore } = await adminClient.mutation(
          "_system/frontend/clearTablePage",
          { tableName, cursor: continueCursor },
        ));
        totalDeleted[tableName] += deleted;
      }
    }
  }
  return totalDeleted;
}

export async function compareSchema(skip: (note?: string) => void) {
  if (!answerAdminClient) {
    skip("Answer backend not available");
    return;
  }
  const responseSchema = await getSchema(responseAdminClient);
  const answerSchema = await getSchema(answerAdminClient);
  expect(responseSchema).toEqual(answerSchema);
}

async function getFunctionSpec(adminClient: any) {
  const result = await adminClient.query(
    "_system/cli/modules:apiSpec" as any,
    {},
  );
  return result;
}

export async function compareFunctionSpec(skip: (note?: string) => void) {
  if (!answerAdminClient) {
    skip("Answer backend not available");
    return;
  }
  const responseFunctionSpec = await getFunctionSpec(responseAdminClient);
  const answerFunctionSpec = await getFunctionSpec(answerAdminClient);
  expect(responseFunctionSpec).toEqual(answerFunctionSpec);
}

/**
 * Helpers for inspecting schema indexes in graders
 */
export function findTable(
  schema: any,
  tableName: string,
): {
  tableName: string;
  indexes?: { fields?: string[]; fieldNames?: string[] }[];
} | null {
  if (!schema || !Array.isArray(schema.tables)) return null;
  return schema.tables.find((t: any) => t.tableName === tableName) ?? null;
}

export function hasIndexForFields(
  schema: any,
  tableName: string,
  fields: string[],
): boolean {
  const table = findTable(schema, tableName);
  if (!table) return false;
  const indexes = (table.indexes ?? []) as {
    fields?: string[];
    fieldNames?: string[];
  }[];
  return indexes.some((idx) => {
    const idxFields = idx.fields ?? idx.fieldNames ?? [];
    return (
      Array.isArray(idxFields) &&
      idxFields.length === fields.length &&
      idxFields.every((f, i) => f === fields[i])
    );
  });
}

export async function hasIndexOn(
  schema: any,
  tableName: string,
  fields: string[],
): Promise<boolean> {
  return hasIndexForFields(schema, tableName, fields);
}

export function hasIndexForPrefix(
  schema: any,
  tableName: string,
  fieldsPrefix: string[],
): boolean {
  const table = findTable(schema, tableName);
  if (!table) return false;
  const indexes = (table.indexes ?? []) as {
    fields?: string[];
    fieldNames?: string[];
  }[];
  return indexes.some((idx) => {
    const idxFields = (idx.fields ?? idx.fieldNames ?? []);
    if (!Array.isArray(idxFields)) return false;
    if (idxFields.length < fieldsPrefix.length) return false;
    for (let i = 0; i < fieldsPrefix.length; i++) {
      if (idxFields[i] !== fieldsPrefix[i]) return false;
    }
    return true;
  });
}

export async function hasIndexWithPrefix(
  schema: any,
  tableName: string,
  fieldsPrefix: string[],
): Promise<boolean> {
  return hasIndexForPrefix(schema, tableName, fieldsPrefix);
}

/**
 * Locate the model's generated output directory for a given eval.
 * Scans OUTPUT_TEMPDIR (if set) and the OS tempdir for output directories
 * matching the category/name, preferring directories whose .env.local
 * references the current CONVEX_PORT.
 */
export function getLatestOutputProjectDir(
  category: string,
  name: string,
): string {
  const configuredRoot = process.env.OUTPUT_TEMPDIR;
  const candidateRoots: { dir: string; mtime: number }[] = [];
  const currentPort = process.env.CONVEX_PORT;

  const addCandidateRoots = (outputRoot: string) => {
    for (const providerDir of readdirSync(outputRoot, {
      withFileTypes: true,
    })) {
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

      for (const modelDir of readdirSync(providerPath, {
        withFileTypes: true,
      })) {
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

/**
 * Read the source file at the given path from the model's output directory
 * and return its contents. Convenience wrapper for AST checks.
 */
export function readOutputFile(
  category: string,
  name: string,
  relativePath: string,
): string {
  const outputProjectDir = getLatestOutputProjectDir(category, name);
  const filePath = join(outputProjectDir, relativePath);
  return readFileSync(filePath, "utf8");
}

/**
 * Create a client that acts as a specific authenticated user.
 * Uses setAdminAuth with an identity object so that
 * ctx.auth.getUserIdentity() returns the given identity in the
 * model's deployed functions.
 */
export function withIdentity(identity: {
  subject: string;
  issuer: string;
  name?: string;
  email?: string;
}): {
  query: typeof responseClient.query;
  mutation: typeof responseClient.mutation;
  action: typeof responseClient.action;
} {
  const client = new ConvexClient(cloudUrl);
  (client as any).setAdminAuth(adminKey, identity);
  return {
    query: client.query.bind(client),
    mutation: client.mutation.bind(client),
    action: client.action.bind(client),
  };
}

/**
 * AST check: returns true if the source contains a `.collect()` call.
 */
export function containsCollectCall(
  sourceText: string,
  fileName: string,
): boolean {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let found = false;

  const visit = (node: ts.Node) => {
    if (found) return;
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "collect"
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}
