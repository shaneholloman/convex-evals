# Add-Eval Reference

Supplementary lookup doc for the add-eval skill. Keep workflow and sequencing in `SKILL.md`. Use this file for grader helpers, common test patterns, and durable conventions.

## Grader Helper Catalog

All helpers are exported from `grader/index.ts`. Import them in `grader.test.ts` using
relative paths like `import { responseClient, addDocuments } from "../../../grader";`

### Clients

| Export | Type | Description |
|--------|------|-------------|
| `responseClient` | `ConvexClient` | Client connected to the **model's** deployed backend. Use for calling the model's public functions. |
| `responseAdminClient` | `ConvexClient` (admin) | Admin client for the model's backend. Used for data seeding, schema inspection, and internal function calls. |
| `answerAdminClient` | `ConvexClient \| null` (admin) | Admin client for the **answer** backend. Only available when `CONVEX_ANSWER_PORT` is set. Used by `compareSchema` / `compareFunctionSpec`. |
| `cloudUrl` | `string` | `http://localhost:<CONVEX_PORT>` |
| `siteUrl` | `string` | `http://localhost:<CONVEX_SITE_PORT>` - use for HTTP action endpoint testing. |

### Data Helpers

| Helper | Signature | Description |
|--------|-----------|-------------|
| `addDocuments` | `(adminClient, table, documents[]) => Promise<void>` | Insert documents into a table via the admin API. |
| `listTable` | `(adminClient, table, limit?) => Promise<any[]>` | List documents from a table in ascending creation order. Default limit 32. |
| `deleteAllDocuments` | `(adminClient, tables[]) => Promise<Record<string, number>>` | Clear all documents from the given tables. Use for test cleanup. |

### Schema Inspection

| Helper | Signature | Description |
|--------|-----------|-------------|
| `compareSchema` | `(skip) => Promise<void>` | Compare the model's schema to the answer's schema. Skips if answer backend unavailable. |
| `compareFunctionSpec` | `(skip) => Promise<void>` | Compare the model's exported function signatures to the answer's. |
| `getSchema` | `(adminClient) => Promise<any>` | Fetch the active schema from a backend. Returns parsed JSON with `tables` array. |
| `findTable` | `(schema, tableName) => object \| null` | Find a table definition in a schema object. |
| `hasIndexForFields` | `(schema, tableName, fields[]) => boolean` | Check if a table has an index with exactly the given fields (in order). |
| `hasIndexForPrefix` | `(schema, tableName, fieldsPrefix[]) => boolean` | Check if a table has an index whose fields start with the given prefix. |

### AI Grading (currently disabled)

| Helper | Signature | Description |
|--------|-----------|-------------|
| `createAIGraderTest` | `(testFileUrl, name?, timeoutMs?) => void` | Intended to create a Vitest test that uses GPT to grade the model's output against TASK.txt. It is currently a no-op and requires a repo change in `grader/aiGrader.ts` before it will run anything. |

Import from `grader/aiGrader`:
```typescript
import { createAIGraderTest } from "../../../grader/aiGrader";
createAIGraderTest(import.meta.url);
```

## Common Test Patterns

### 1. Schema comparison

When the TASK.txt specifies an exact schema, include a schema comparison test:

```typescript
import { compareSchema } from "../../../grader";

test("compare schema", async ({ skip }) => {
  await compareSchema(skip);
});
```

### 2. Behavior testing with typed API

When function names and file paths are fixed, import the answer's generated API for type safety:

```typescript
import { api } from "./answer/convex/_generated/api";

test("creates a user", async () => {
  const id = await responseClient.mutation(api.users.create, { name: "Alice" });
  expect(id).toBeDefined();
});
```

### 3. Behavior testing with anyApi

When the model might place functions in different files, use `anyApi` for flexible path resolution:

```typescript
import { anyApi } from "convex/server";

test("query works", async () => {
  const result = await responseClient.query(anyApi.public.getMessages, {});
  expect(result).toEqual([]);
});
```

### 4. Data seeding and cleanup

Seed test data before assertions, clean up between tests if needed:

```typescript
import { responseAdminClient, addDocuments, deleteAllDocuments, listTable } from "../../../grader";

test("filters correctly", async () => {
  await addDocuments(responseAdminClient, "messages", [
    { text: "hello", author: "alice", isPinned: true, likes: 10 },
    { text: "world", author: "alice", isPinned: false, likes: 5 },
  ]);

  const result = await responseClient.query(anyApi.public.getPinned, { author: "alice" });
  expect(result).toHaveLength(1);
  expect(result[0].text).toBe("hello");
});
```

### 5. Cleanup with `afterEach`

When tests mutate backend state, clear relevant tables after each test so cases stay independent:

```typescript
import { afterEach } from "vitest";
import { responseAdminClient, deleteAllDocuments } from "../../../grader";

afterEach(async () => {
  await deleteAllDocuments(responseAdminClient, ["messages", "users"]);
});
```

### 6. Function spec comparison

When the task fixes exported public/internal function names or locations, compare the function spec against the answer:

```typescript
import { compareFunctionSpec } from "../../../grader";

test("compare function spec", async ({ skip }) => {
  await compareFunctionSpec(skip);
});
```

### 7. HTTP endpoint testing

For HTTP action evals, fetch against the site URL:

```typescript
import { siteUrl } from "../../../grader";

test("GET /api/health returns 200", async () => {
  const res = await fetch(`${siteUrl}/api/health`);
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.ok).toBe(true);
});
```

### 8. Argument validation

Verify that validators reject bad input:

```typescript
test("rejects invalid arguments", async () => {
  await expect(
    responseClient.mutation(api.index.createUser, { name: 123 } as any),
  ).rejects.toThrow(/ArgumentValidationError/);
});
```

### 9. Function type checking

Verify a query can't be called as a mutation (and vice versa):

```typescript
test("is a query, not a mutation", async () => {
  await expect(
    responseClient.mutation(api.index.getUsers as any, {}),
  ).rejects.toBeDefined();
});
```

### 10. Schema/index inspection (without answer comparison)

When you need to check index structure directly:

```typescript
import { getSchema, hasIndexForFields } from "../../../grader";

test("has correct indexes", async () => {
  const schema = await getSchema(responseAdminClient);
  expect(hasIndexForFields(schema, "messages", ["author", "createdAt"])).toBe(true);
});
```

## Test Approach Decision Tree

Use this to decide how to grade an eval:

```
Can the concept be verified by calling the function and checking the return value?
├── YES -> Use behavior tests (patterns 2-4 above)
│   └── Does the task specify an exact schema?
│       ├── YES -> Also add compareSchema test (pattern 1)
│       └── NO  -> Skip schema comparison
│
└── NO (concept is about HOW the code is structured, not WHAT it returns)
    ├── Is it about schema/index design?
    │   └── YES -> Use schema inspection helpers (pattern 8)
    │       hasIndexForFields, hasIndexForPrefix, getSchema
    │
    ├── Is it about which files/functions are exported?
    │   └── YES -> Use compareFunctionSpec
    │
    ├── Is it about HTTP endpoint routing?
    │   └── YES -> Use HTTP endpoint testing (pattern 5)
    │
    └── Is it about code style, patterns, or internal structure?
        └── STOP and discuss with user. Options:
            a. AI grading (createAIGraderTest) - currently a no-op, requires a repo change before it can be used
            b. AST analysis - parse the generated .ts files and check for specific patterns
            c. Restructure the eval so the concept CAN be tested via behavior
            d. Accept that this concept isn't well-suited for automated eval
```

## Grading the Model's Own Tests

Some evals ask the model to write its own test suite (e.g. `convex-test` evals). The grader can execute the model's tests using `MODEL_OUTPUT_DIR`, an environment variable set by the scorer that points to the model's generated project directory.

```typescript
import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

test("model's test suite passes", () => {
  const outputDir = process.env.MODEL_OUTPUT_DIR;
  if (!outputDir) throw new Error("MODEL_OUTPUT_DIR not set");

  expect(existsSync(join(outputDir, "convex/tasks.test.ts"))).toBe(true);

  const vitestBin = join(outputDir, "node_modules", ".bin", "vitest");
  const stdout = execSync(
    `"${vitestBin}" run --reporter=json --no-color 2>&1`,
    {
      cwd: outputDir,
      encoding: "utf-8",
      timeout: 60000,
      shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
    },
  );
  // parse JSON output and assert
});
```

**Important:** Always use the explicit binary path (`node_modules/.bin/vitest`) instead of `bunx vitest`. The grader runs inside the scorer's vitest process, and `bunx` can resolve to the wrong binary in nested vitest contexts. Also avoid being too prescriptive about test structure (e.g. minimum test count). Models validly write single integration tests or many small unit tests.

## TASK.txt Conventions

### What to include

- Complete schema in a TypeScript code block (when applicable)
- Exact function names, argument types, and return shapes
- Which files to create (`convex/schema.ts`, `convex/index.ts`, etc.)
- What NOT to create (if relevant)
- Edge case behaviors (what to return when no results, error messages, etc.)
- Problem domain context (what the feature does)

### What NOT to include

- Convex implementation details covered by the guidelines (e.g. how to use `internalMutation`, how pagination works internally, how to register crons)
- Step-by-step implementation instructions (we're testing knowledge, not instruction-following)
- Import statements or boilerplate

### Naming

- Eval directory names use underscores, no dashes: `017-pagination_join`, `002-userspace_filter`
- Category + eval names cannot contain dashes
- Number prefix is sequential within the category (check existing evals for the next number)

## Answer Conventions

### package.json template

```json
{
  "name": "convexbot",
  "version": "1.0.0",
  "dependencies": {
    "convex": "^1.31.2"
  }
}
```

### Directory structure

```
answer/
├── package.json
└── convex/
    ├── schema.ts          (if eval uses a schema)
    ├── tsconfig.json      (auto-generated by codegen)
    ├── _generated/        (auto-generated by codegen)
    │   ├── api.d.ts
    │   ├── api.js
    │   ├── dataModel.d.ts
    │   ├── server.d.ts
    │   └── server.js
    └── <implementation>.ts (index.ts, public.ts, users.ts, etc.)
```

### Codegen

After writing the answer source files, run codegen to generate types:

```bash
cd evals/<category>/<eval>/answer && bunx convex codegen
```

Run codegen again if you change the schema. The grader imports types from `./answer/convex/_generated/api`, so codegen must be run before tests will compile.
