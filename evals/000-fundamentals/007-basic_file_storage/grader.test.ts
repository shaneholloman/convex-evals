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
          fileId: {
            fieldType: {
              tableName: "files",
              type: "id",
            },
            optional: false,
          },
        },
      },
      functionType: "Mutation",
      identifier: "public.js:deleteFile",
      returns: {
        type: "null",
      },
      visibility: {
        kind: "public",
      },
    },
    {
      args: {
        type: "object",
        value: {
          storageId: {
            fieldType: {
              tableName: "_storage",
              type: "id",
            },
            optional: false,
          },
        },
      },
      functionType: "Mutation",
      identifier: "public.js:finishUpload",
      returns: {
        type: "null",
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
      identifier: "public.js:generateUploadUrl",
      returns: {
        type: "string",
      },
      visibility: {
        kind: "public",
      },
    },
    {
      args: {
        type: "object",
        value: {
          fileId: {
            fieldType: {
              tableName: "files",
              type: "id",
            },
            optional: false,
          },
        },
      },
      functionType: "Query",
      identifier: "public.js:getFileMetadata",
      returns: {
        type: "object",
        value: {
          contentType: {
            fieldType: {
              type: "string",
            },
            optional: false,
          },
          sha256: {
            fieldType: {
              type: "string",
            },
            optional: false,
          },
          size: {
            fieldType: {
              type: "number",
            },
            optional: false,
          },
        },
      },
      visibility: {
        kind: "public",
      },
    },
    {
      args: {
        type: "object",
        value: {
          fileId: {
            fieldType: {
              tableName: "files",
              type: "id",
            },
            optional: false,
          },
        },
      },
      functionType: "Query",
      identifier: "public.js:getFileUrl",
      returns: {
        type: "string",
      },
      visibility: {
        kind: "public",
      },
    },
  ]);
});
