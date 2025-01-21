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
      args: {
        type: "object",
        value: {
          x: {
            fieldType: {
              type: "number",
            },
            optional: false,
          },
          y: {
            fieldType: {
              type: "number",
            },
            optional: false,
          },
        },
      },
      functionType: "Action",
      identifier: "public.js:calleeAction",
      returns: {
        type: "any",
      },
      visibility: {
        kind: "internal",
      },
    },
    {
      args: {
        type: "object",
        value: {
          x: {
            fieldType: {
              type: "number",
            },
            optional: false,
          },
          y: {
            fieldType: {
              type: "number",
            },
            optional: false,
          },
        },
      },
      functionType: "Mutation",
      identifier: "public.js:calleeMutation",
      returns: {
        type: "any",
      },
      visibility: {
        kind: "internal",
      },
    },
    {
      args: {
        type: "object",
        value: {
          x: {
            fieldType: {
              type: "number",
            },
            optional: false,
          },
          y: {
            fieldType: {
              type: "number",
            },
            optional: false,
          },
        },
      },
      functionType: "Query",
      identifier: "public.js:calleeQuery",
      returns: {
        type: "any",
      },
      visibility: {
        kind: "internal",
      },
    },
    {
      args: {
        type: "object",
        value: {},
      },
      functionType: "Action",
      identifier: "public.js:callerAction",
      returns: {
        type: "any",
      },
      visibility: {
        kind: "public",
      },
    },
    {
      args: {
        type: "object",
        value: {},
      },
      functionType: "Mutation",
      identifier: "public.js:callerMutation",
      returns: {
        type: "any",
      },
      visibility: {
        kind: "public",
      },
    },
  ]);
});
