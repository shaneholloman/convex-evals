import { expect, test, beforeEach } from "vitest";
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

const userAIdentity = { subject: "user-a", issuer: ISSUER, name: "Alice" };
const userBIdentity = { subject: "user-b", issuer: ISSUER, name: "Bob" };

function tokenIdentifier(identity: { subject: string; issuer: string }) {
  return `${identity.issuer}|${identity.subject}`;
}

beforeEach(async () => {
  await deleteAllDocuments(responseAdminClient, [
    "tasks",
    "projectMembers",
    "projects",
    "users",
  ]);
});

async function seedTestData() {
  await addDocuments(responseAdminClient, "users", [
    { tokenIdentifier: tokenIdentifier(userAIdentity), name: "Alice" },
    { tokenIdentifier: tokenIdentifier(userBIdentity), name: "Bob" },
  ]);
  const users = await listTable(responseAdminClient, "users");
  const alice = users.find((u: any) => u.name === "Alice");
  const bob = users.find((u: any) => u.name === "Bob");

  await addDocuments(responseAdminClient, "projects", [
    { name: "Alice's Project" },
  ]);
  const projects = await listTable(responseAdminClient, "projects");
  const project = projects[0];

  // Only Alice is a member
  await addDocuments(responseAdminClient, "projectMembers", [
    { projectId: project._id, userId: alice._id },
  ]);

  await addDocuments(responseAdminClient, "tasks", [
    { projectId: project._id, text: "Existing task", completed: false },
  ]);

  return { alice, bob, project };
}

test("compare schema", async ({ skip }) => {
  await compareSchema(skip);
});

test("authenticated member can list tasks", async () => {
  const { project } = await seedTestData();
  const asAlice = withIdentity(userAIdentity);

  const tasks = await asAlice.query(anyApi.index.listTasks, {
    projectId: project._id,
  });

  expect(tasks).toHaveLength(1);
  expect(tasks[0].text).toBe("Existing task");
});

test("authenticated member can create tasks", async () => {
  const { project } = await seedTestData();
  const asAlice = withIdentity(userAIdentity);

  await asAlice.mutation(anyApi.index.createTask, {
    projectId: project._id,
    text: "New task from Alice",
  });

  const tasks = await asAlice.query(anyApi.index.listTasks, {
    projectId: project._id,
  });

  expect(tasks).toHaveLength(2);
  const texts = tasks.map((t: any) => t.text).sort();
  expect(texts).toContain("New task from Alice");
});

test("authenticated non-member cannot list tasks", async () => {
  const { project } = await seedTestData();
  const asBob = withIdentity(userBIdentity);

  await expect(
    asBob.query(anyApi.index.listTasks, { projectId: project._id }),
  ).rejects.toThrow();
});

test("authenticated non-member cannot create tasks", async () => {
  const { project } = await seedTestData();
  const asBob = withIdentity(userBIdentity);

  await expect(
    asBob.mutation(anyApi.index.createTask, {
      projectId: project._id,
      text: "Sneaky task from Bob",
    }),
  ).rejects.toThrow();
});

test("unauthenticated user cannot list tasks", async () => {
  const { project } = await seedTestData();

  await expect(
    responseClient.query(anyApi.index.listTasks, {
      projectId: project._id,
    }),
  ).rejects.toThrow();
});

test("unauthenticated user cannot create tasks", async () => {
  const { project } = await seedTestData();

  await expect(
    responseClient.mutation(anyApi.index.createTask, {
      projectId: project._id,
      text: "Anonymous task",
    }),
  ).rejects.toThrow();
});
