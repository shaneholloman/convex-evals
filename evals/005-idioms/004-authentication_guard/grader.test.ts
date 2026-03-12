import { beforeEach, expect, test } from "vitest";
import {
  addDocuments,
  compareSchema,
  deleteAllDocuments,
  listTable,
  responseAdminClient,
  responseClient,
  withIdentity,
} from "../../../grader";
import { anyApi } from "convex/server";

const ISSUER = "https://test-auth.example.com";
const memberIdentity = { subject: "user-a", issuer: ISSUER, name: "Alice" };
const unknownIdentity = { subject: "user-missing", issuer: ISSUER, name: "Ghost" };

function tokenIdentifier(identity: { subject: string; issuer: string }) {
  return `${identity.issuer}|${identity.subject}`;
}

beforeEach(async () => {
  await deleteAllDocuments(responseAdminClient, ["exportRequests", "users"]);
});

async function seedUsers() {
  await addDocuments(responseAdminClient, "users", [
    {
      tokenIdentifier: tokenIdentifier(memberIdentity),
      email: "alice@example.com",
      name: "Alice",
    },
  ]);
  const users = await listTable(responseAdminClient, "users");
  const alice = users.find((user: any) => user.email === "alice@example.com");
  return { alice };
}

test("compare schema", async ({ skip }) => {
  await compareSchema(skip);
});

test("authenticated user can request export", async () => {
  const { alice } = await seedUsers();
  const asAlice = withIdentity(memberIdentity);

  const exportRequestId = await asAlice.mutation(anyApi.exports.requestExport, {
    projectName: "Roadmap",
    destinationEmail: "export@example.com",
  });

  expect(exportRequestId).toBeDefined();

  const exportRequests = await listTable(responseAdminClient, "exportRequests");
  expect(exportRequests).toHaveLength(1);
  expect(exportRequests[0].projectName).toBe("Roadmap");
  expect(exportRequests[0].destinationEmail).toBe("export@example.com");
  expect(exportRequests[0].status).toBe("queued");
  expect(exportRequests[0].requestedByUserId).toBe(alice._id);
});

test("unauthenticated user cannot request export", async () => {
  await seedUsers();

  await expect(
    responseClient.mutation(anyApi.exports.requestExport, {
      projectName: "Roadmap",
      destinationEmail: "export@example.com",
    }),
  ).rejects.toThrow();
});

test("authenticated identity without matching user is rejected", async () => {
  await seedUsers();
  const asUnknown = withIdentity(unknownIdentity);

  await expect(
    asUnknown.mutation(anyApi.exports.requestExport, {
      projectName: "Roadmap",
      destinationEmail: "export@example.com",
    }),
  ).rejects.toThrow();
});
