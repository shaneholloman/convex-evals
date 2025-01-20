import { expect, test } from "vitest";
import { getActiveSchema } from "../../../grader";

test("check schema", async () => {
  const schema = await getActiveSchema();
  const expected = {
    tables: [
      {
        tableName: "users",
        indexes: [],
        searchIndexes: [],
        vectorIndexes: [],
        documentType: {
          type: "object",
          value: {
            name: { fieldType: { type: "string" }, optional: false },
          },
        },
      },
      {
        tableName: "messages",
        indexes: [],
        searchIndexes: [],
        vectorIndexes: [],
        documentType: {
          type: "object",
          value: {
            text: { fieldType: { type: "string" }, optional: false },
            authorName: { fieldType: { type: "string" }, optional: false },
          },
        },
      },
    ],
    schemaValidation: true,
  };
  schema.tables.sort((a: any, b: any) =>
    a.tableName.localeCompare(b.tableName),
  );
  expected.tables.sort((a, b) => a.tableName.localeCompare(b.tableName));
  expect(schema).toEqual(expected);
});
