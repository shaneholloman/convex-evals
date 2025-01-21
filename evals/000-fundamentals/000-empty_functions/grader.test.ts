import { expect, test } from "vitest";
import {
  adminClient,
  client,
  checkSchemaJson,
  checkFunctionSpec,
} from "../../../grader";
import { anyApi } from "convex/server";

test("check schema", async () => {
  await checkSchemaJson(null);
});

test("check function spec", async () => {
  await checkFunctionSpec([
    {
      args: { type: "object", value: {} },
      functionType: "Action",
      identifier: "index.js:emptyPrivateAction",
      returns: { type: "null" },
      visibility: { kind: "internal" },
    },
    {
      args: { type: "object", value: {} },
      functionType: "Mutation",
      identifier: "index.js:emptyPrivateMutation",
      returns: { type: "null" },
      visibility: { kind: "internal" },
    },
    {
      args: { type: "object", value: {} },
      functionType: "Query",
      identifier: "index.js:emptyPrivateQuery",
      returns: { type: "null" },
      visibility: { kind: "internal" },
    },
    {
      args: { type: "object", value: {} },
      functionType: "Action",
      identifier: "index.js:emptyPublicAction",
      returns: { type: "null" },
      visibility: { kind: "public" },
    },
    {
      args: { type: "object", value: {} },
      functionType: "Mutation",
      identifier: "index.js:emptyPublicMutation",
      returns: { type: "null" },
      visibility: { kind: "public" },
    },
    {
      args: { type: "object", value: {} },
      functionType: "Query",
      identifier: "index.js:emptyPublicQuery",
      returns: { type: "null" },
      visibility: { kind: "public" },
    },
  ]);
});

test("empty public query", async () => {
  const result = await client.query(anyApi.index.emptyPublicQuery, {});
  expect(result).toBe(null);

  let error: any = undefined;
  try {
    await client.query(anyApi.index.emptyPublicQuery, {
      arg: "test",
    });
  } catch (e) {
    error = e;
  }
  expect(error).toBeDefined();
  expect(error.toString()).toContain("ArgumentValidationError");

  error = undefined;
  try {
    await client.mutation(anyApi.index.emptyPublicQuery, {});
  } catch (e) {
    error = e;
  }
  expect(error).toBeDefined();

  error = undefined;
  try {
    await client.action(anyApi.index.emptyPublicQuery, {});
  } catch (e) {
    error = e;
  }
  expect(error).toBeDefined();
});

test("empty public mutation", async () => {
  const result = await client.mutation(anyApi.index.emptyPublicMutation, {});
  expect(result).toBe(null);

  let error: any = undefined;
  try {
    await client.mutation(anyApi.index.emptyPublicMutation, {
      arg: "test",
    });
  } catch (e) {
    error = e;
  }
  expect(error).toBeDefined();
  expect(error.toString()).toContain("ArgumentValidationError");

  error = undefined;
  try {
    await client.query(anyApi.index.emptyPublicMutation, {});
  } catch (e) {
    error = e;
  }
  expect(error).toBeDefined();

  error = undefined;
  try {
    await client.action(anyApi.index.emptyPublicMutation, {});
  } catch (e) {
    error = e;
  }
  expect(error).toBeDefined();
});

test("empty public action", async () => {
  const result = await client.action(anyApi.index.emptyPublicAction, {});
  expect(result).toBe(null);

  let error: any = undefined;
  try {
    await client.action(anyApi.index.emptyPublicAction, {
      arg: "test",
    });
  } catch (e) {
    error = e;
  }
  expect(error).toBeDefined();
  expect(error.toString()).toContain("ArgumentValidationError");

  error = undefined;
  try {
    await client.query(anyApi.index.emptyPublicAction, {});
  } catch (e) {
    error = e;
  }
  expect(error).toBeDefined();

  error = undefined;
  try {
    await client.mutation(anyApi.index.emptyPublicAction, {});
  } catch (e) {
    error = e;
  }
  expect(error).toBeDefined();
});

test("empty private query", async () => {
  let error: any = undefined;
  try {
    await client.query(anyApi.index.emptyPrivateQuery, {});
  } catch (e) {
    error = e;
  }
  expect(error).toBeDefined();
  expect(error.toString()).toContain("Could not find public function");

  const result = await adminClient.query(anyApi.index.emptyPrivateQuery, {});
  expect(result).toBe(null);
});

test("empty private mutation", async () => {
  let error: any = undefined;
  try {
    await client.mutation(anyApi.index.emptyPrivateMutation, {});
  } catch (e) {
    error = e;
  }
  expect(error).toBeDefined();
  expect(error.toString()).toContain("Could not find public function");

  const result = await adminClient.mutation(
    anyApi.index.emptyPrivateMutation,
    {},
  );
  expect(result).toBe(null);
});

test("empty private action", async () => {
  let error: any = undefined;
  try {
    await client.action(anyApi.index.emptyPrivateAction, {});
  } catch (e) {
    error = e;
  }
  expect(error).toBeDefined();
  expect(error.toString()).toContain("Could not find public function");

  const result = await adminClient.action(anyApi.index.emptyPrivateAction, {});
  expect(result).toBe(null);
});
