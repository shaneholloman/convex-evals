import { expect, test } from "vitest";
import {
  responseAdminClient,
  responseClient,
  compareSchema,
  addDocuments,
} from "../../../grader";
import { anyApi } from "convex/server";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";

test("compare schema", async ({ skip }) => {
  await compareSchema(skip);
});

test("get all products returns empty list when no products exist", async () => {
  const products = await responseClient.query(anyApi.public.getAllProducts, {});
  expect(products).toEqual([]);
});

test("get all products returns all products in the table", async () => {
  // Load test data
  const testProducts = [
    { name: "Apple", price: 1.99, inStock: true },
    { name: "Banana", price: 0.99, inStock: true },
    { name: "Orange", price: 2.49, inStock: false },
    { name: "Mango", price: 3.99, inStock: true },
  ];
  await addDocuments(responseAdminClient, "products", testProducts);

  // Query all products
  const products = await responseClient.query(anyApi.public.getAllProducts, {});

  // Verify all products are returned
  expect(products).toHaveLength(testProducts.length);

  // Verify each product has the correct fields
  for (const product of products) {
    expect(product).toHaveProperty("_id");
    expect(product).toHaveProperty("_creationTime");
    expect(product).toHaveProperty("name");
    expect(product).toHaveProperty("price");
    expect(product).toHaveProperty("inStock");
  }

  // Verify the data matches our test data
  const sortedProducts = products
    .map(
      (p: {
        name: string;
        price: number;
        inStock: boolean;
        _id: string;
        _creationTime: number;
      }) => ({ name: p.name, price: p.price, inStock: p.inStock }),
    )
    .sort((a: { name: string }, b: { name: string }) =>
      a.name.localeCompare(b.name),
    );
  const sortedTestProducts = [...testProducts].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  expect(sortedProducts).toEqual(sortedTestProducts);
});

function getLatestOutputProjectDir(): string {
  const category = "002-queries";
  const name = "000-all_rows";
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

test("generated solution uses .collect() since the task asks for all rows", () => {
  const outputProjectDir = getLatestOutputProjectDir();
  const publicPath = join(outputProjectDir, "convex", "public.ts");
  const sourceText = readFileSync(publicPath, "utf8");

  expect(containsCollectCall(sourceText, publicPath)).toBe(true);
});
