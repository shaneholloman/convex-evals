import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

type ErrorResponse = { error: string };
type SuccessResponse = { success: boolean; id: string };

describe("POST /updateScores", () => {
  it("rejects requests without auth token", async () => {
    const t = convexTest(schema, modules);

    const response = await t.fetch("/updateScores", {
      method: "POST",
      body: JSON.stringify({
        model: "test-model",
        scores: { category1: 0.9 },
        totalScore: 0.9,
      }),
    });

    expect(response.status).toBe(401);
    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toBe("Missing authentication token");
  });

  it("rejects requests with invalid auth token", async () => {
    const t = convexTest(schema, modules);

    const response = await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: "Bearer invalid-token" },
      body: JSON.stringify({
        model: "test-model",
        scores: { category1: 0.9 },
        totalScore: 0.9,
      }),
    });

    expect(response.status).toBe(401);
    const body = (await response.json()) as ErrorResponse;
    expect(body.error).toBe("Invalid authentication token");
  });

  it("rejects requests with invalid body (missing model)", async () => {
    const t = convexTest(schema, modules);

    const token = await t.mutation(internal.auth.createToken, {
      name: "test-token",
    });

    const response = await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        scores: { category1: 0.9 },
        totalScore: 0.9,
      }),
    });

    expect(response.status).toBe(400);
  });

  it("rejects requests with invalid body (scores not a record)", async () => {
    const t = convexTest(schema, modules);

    const token = await t.mutation(internal.auth.createToken, {
      name: "test-token",
    });

    const response = await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "test-model",
        scores: "not-an-object",
        totalScore: 0.9,
      }),
    });

    expect(response.status).toBe(400);
  });

  it("rejects requests with invalid body (totalScore not a number)", async () => {
    const t = convexTest(schema, modules);

    const token = await t.mutation(internal.auth.createToken, {
      name: "test-token",
    });

    const response = await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "test-model",
        scores: { category1: 0.9 },
        totalScore: "not-a-number",
      }),
    });

    expect(response.status).toBe(400);
  });

  it("creates new scores with valid auth and body", async () => {
    const t = convexTest(schema, modules);

    const token = await t.mutation(internal.auth.createToken, {
      name: "test-token",
    });

    const response = await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "gpt-4",
        scores: { fundamentals: 0.95, queries: 0.88 },
        totalScore: 0.915,
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as SuccessResponse;
    expect(body.success).toBe(true);
    expect(body.id).toBeDefined();

    // Verify the scores were saved
    const savedScores = await t.query(api.evalScores.getScores, {
      model: "gpt-4",
    });
    expect(savedScores).toMatchObject({
      model: "gpt-4",
      scores: { fundamentals: 0.95, queries: 0.88 },
      totalScore: 0.915,
    });
  });

  it("appends new scores for the same model (preserves history)", async () => {
    const t = convexTest(schema, modules);

    const token = await t.mutation(internal.auth.createToken, {
      name: "test-token",
    });

    // Create initial scores
    const response1 = await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "claude-3",
        scores: { fundamentals: 0.9 },
        totalScore: 0.9,
      }),
    });
    expect(response1.status).toBe(200);
    const body1 = (await response1.json()) as SuccessResponse;

    // Add another run
    const response2 = await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "claude-3",
        scores: { fundamentals: 0.95, queries: 0.92 },
        totalScore: 0.935,
      }),
    });
    expect(response2.status).toBe(200);
    const body2 = (await response2.json()) as SuccessResponse;

    // Should have different IDs (both records exist)
    expect(body1.id).not.toBe(body2.id);

    // getScores returns the latest
    const savedScores = await t.query(api.evalScores.getScores, {
      model: "claude-3",
    });
    expect(savedScores).toMatchObject({
      model: "claude-3",
      scores: { fundamentals: 0.95, queries: 0.92 },
      totalScore: 0.935,
    });
  });

  it("accepts token without Bearer prefix", async () => {
    const t = convexTest(schema, modules);

    const token = await t.mutation(internal.auth.createToken, {
      name: "test-token",
    });

    const response = await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: token.value },
      body: JSON.stringify({
        model: "test-model",
        scores: { category1: 0.8 },
        totalScore: 0.8,
      }),
    });

    expect(response.status).toBe(200);
  });

  it("accepts optional runId", async () => {
    const t = convexTest(schema, modules);

    const token = await t.mutation(internal.auth.createToken, {
      name: "test-token",
    });

    const response = await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "test-model",
        scores: { category1: 0.8 },
        totalScore: 0.8,
        runId: "abc123",
      }),
    });

    expect(response.status).toBe(200);
  });

  it("accepts optional experiment parameter", async () => {
    const t = convexTest(schema, modules);

    const token = await t.mutation(internal.auth.createToken, {
      name: "test-token",
    });

    const response = await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "test-model",
        scores: { category1: 0.8 },
        totalScore: 0.8,
        experiment: "no_guidelines",
      }),
    });

    expect(response.status).toBe(200);

    // Verify it was saved with the experiment tag
    const runs = await t.query(api.evalScores.listAllRuns, {
      experiment: "no_guidelines",
    });
    expect(runs).toHaveLength(1);
    expect(runs[0].experiment).toBe("no_guidelines");
  });

  it("rejects invalid experiment values", async () => {
    const t = convexTest(schema, modules);

    const token = await t.mutation(internal.auth.createToken, {
      name: "test-token",
    });

    const response = await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "test-model",
        scores: { category1: 0.8 },
        totalScore: 0.8,
        experiment: "invalid_experiment",
      }),
    });

    expect(response.status).toBe(400);
  });
});

