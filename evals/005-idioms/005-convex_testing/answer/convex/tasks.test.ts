/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("tasks", () => {
  it("returns empty array when no tasks exist", async () => {
    const t = convexTest(schema, modules);
    const tasks = await t.query(api.tasks.list);
    expect(tasks).toEqual([]);
  });

  it("creates a task and lists it", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.tasks.create, { text: "Buy groceries" });
    expect(id).toBeDefined();

    const tasks = await t.query(api.tasks.list);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      text: "Buy groceries",
      isCompleted: false,
    });
  });

  it("completes a task", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.tasks.create, { text: "Write tests" });

    await t.mutation(api.tasks.complete, { id });

    const tasks = await t.query(api.tasks.list);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].isCompleted).toBe(true);
  });

  it("removes a task", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.tasks.create, { text: "Temporary task" });

    await t.mutation(api.tasks.remove, { id });

    const tasks = await t.query(api.tasks.list);
    expect(tasks).toHaveLength(0);
  });
});
