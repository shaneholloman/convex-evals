import { expect, test, beforeEach } from "vitest";
import {
  deleteAllDocuments,
  getSchema,
  responseAdminClient,
  responseClient,
  readOutputFile,
} from "../../../grader";
import { anyApi } from "convex/server";
import ts from "typescript";
import { createAIGraderTest } from "../../../grader/aiGrader";

createAIGraderTest(import.meta.url);

beforeEach(async () => {
  const schema = await getSchema(responseAdminClient);
  if (schema && Array.isArray(schema.tables)) {
    const tableNames = schema.tables.map((t: any) => t.tableName);
    await deleteAllDocuments(responseAdminClient, tableNames);
  }
});

test("schema uses a separate table for checklist items instead of an embedded array", async () => {
  const schema = (await getSchema(responseAdminClient)) as {
    tables?: { tableName: string; documentType?: any }[];
  } | null;
  expect(schema).not.toBeNull();

  const tables = schema!.tables ?? [];
  const userTables = tables.filter(
    (t) => !t.tableName.startsWith("_"),
  );

  // The model should have created at least 2 user-facing tables:
  // one for tasks and one for checklist items
  expect(
    userTables.length,
    "Expected at least 2 tables (tasks + checklist items). " +
      "Embedding checklist items as an array on the tasks document is an anti-pattern " +
      "that risks hitting the 1MB document size limit.",
  ).toBeGreaterThanOrEqual(2);
});

test("createTask creates a task", async () => {
  const taskId = await responseClient.mutation(anyApi.index.createTask, {
    title: "My Task",
    status: "active",
  });
  expect(taskId).toBeDefined();
});

test("addChecklistItem and getChecklistItems work together", async () => {
  const taskId = await responseClient.mutation(anyApi.index.createTask, {
    title: "My Task",
    status: "active",
  });

  await responseClient.mutation(anyApi.index.addChecklistItem, {
    taskId,
    text: "First item",
  });
  await responseClient.mutation(anyApi.index.addChecklistItem, {
    taskId,
    text: "Second item",
  });

  const items = (await responseClient.query(anyApi.index.getChecklistItems, {
    taskId,
  })) as any[];

  expect(items).toHaveLength(2);
  expect(items.map((i: any) => i.text).sort()).toEqual([
    "First item",
    "Second item",
  ]);
  expect(items.every((i: any) => i.completed === false)).toBe(true);
});

test("getChecklistItems returns only items for the given task", async () => {
  const task1 = await responseClient.mutation(anyApi.index.createTask, {
    title: "Task 1",
    status: "active",
  });
  const task2 = await responseClient.mutation(anyApi.index.createTask, {
    title: "Task 2",
    status: "active",
  });

  await responseClient.mutation(anyApi.index.addChecklistItem, {
    taskId: task1,
    text: "Item for task 1",
  });
  await responseClient.mutation(anyApi.index.addChecklistItem, {
    taskId: task2,
    text: "Item for task 2",
  });

  const items1 = (await responseClient.query(anyApi.index.getChecklistItems, {
    taskId: task1,
  })) as any[];
  const items2 = (await responseClient.query(anyApi.index.getChecklistItems, {
    taskId: task2,
  })) as any[];

  expect(items1).toHaveLength(1);
  expect(items1[0].text).toBe("Item for task 1");
  expect(items2).toHaveLength(1);
  expect(items2[0].text).toBe("Item for task 2");
});

test("checklist items default to not completed", async () => {
  const taskId = await responseClient.mutation(anyApi.index.createTask, {
    title: "Test Task",
    status: "active",
  });

  await responseClient.mutation(anyApi.index.addChecklistItem, {
    taskId,
    text: "Check me",
  });

  const items = (await responseClient.query(anyApi.index.getChecklistItems, {
    taskId,
  })) as any[];

  expect(items).toHaveLength(1);
  expect(items[0].completed).toBe(false);
});

/**
 * Detects v.array(v.object(...)) in schema source, which indicates the
 * anti-pattern of embedding unbounded structured data inside a document
 * instead of normalizing into a separate table.
 */
function schemaContainsArrayOfObjects(sourceText: string): boolean {
  const sourceFile = ts.createSourceFile(
    "schema.ts",
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
      node.expression.name.text === "array"
    ) {
      for (const arg of node.arguments) {
        if (
          ts.isCallExpression(arg) &&
          ts.isPropertyAccessExpression(arg.expression) &&
          arg.expression.name.text === "object"
        ) {
          found = true;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

test("schema.ts does not use v.array(v.object(...)) anti-pattern", () => {
  const sourceText = readOutputFile(
    "001-data_modeling",
    "013-unbounded_array",
    "convex/schema.ts",
  );

  expect(
    schemaContainsArrayOfObjects(sourceText),
    "Schema uses v.array(v.object(...)) which embeds unbounded structured data " +
      "inside a document. This risks hitting the 1MB document size limit and causes " +
      "read/write amplification. Use a separate table with a foreign key instead.",
  ).toBe(false);
});
