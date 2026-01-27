import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

type ErrorResponse = { error: string };
type SuccessResponse = { success: boolean; id: string };
type ScoreEntry = {
  model: string;
  scores: Record<string, number>;
  totalScore: number;
  totalScoreErrorBar: number;
  scoreErrorBars: Record<string, number>;
  runCount: number;
};

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

describe("GET /listScores", () => {
  it("returns empty array when no scores exist", async () => {
    const t = convexTest(schema, modules);

    const response = await t.fetch("/listScores", { method: "GET" });

    expect(response.status).toBe(200);
    const body = (await response.json()) as ScoreEntry[];
    expect(body).toEqual([]);
  });

  it("returns scores with error bars", async () => {
    const t = convexTest(schema, modules);

    const token = await t.mutation(internal.auth.createToken, {
      name: "test-token",
    });

    await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "model-a",
        scores: { cat1: 0.9 },
        totalScore: 0.9,
      }),
    });

    const response = await t.fetch("/listScores", { method: "GET" });

    expect(response.status).toBe(200);
    const body = (await response.json()) as ScoreEntry[];
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      model: "model-a",
      scores: { cat1: 0.9 },
      totalScore: 0.9,
      totalScoreErrorBar: 0, // Only one run, so no variance
      scoreErrorBars: { cat1: 0 },
      runCount: 1,
    });
  });

  it("computes error bars from multiple runs", async () => {
    const t = convexTest(schema, modules);

    const token = await t.mutation(internal.auth.createToken, {
      name: "test-token",
    });

    // Add 3 runs with different scores
    await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "model-x",
        scores: { cat1: 0.8 },
        totalScore: 0.8,
      }),
    });

    await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "model-x",
        scores: { cat1: 0.9 },
        totalScore: 0.9,
      }),
    });

    await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "model-x",
        scores: { cat1: 1.0 },
        totalScore: 1.0,
      }),
    });

    const response = await t.fetch("/listScores", { method: "GET" });

    expect(response.status).toBe(200);
    const body = (await response.json()) as ScoreEntry[];
    expect(body).toHaveLength(1);

    const entry = body[0];
    expect(entry.model).toBe("model-x");
    expect(entry.runCount).toBe(3);

    // Scores [0.8, 0.9, 1.0]: mean = 0.9
    // SD = sqrt(((0.8-0.9)^2 + (0.9-0.9)^2 + (1.0-0.9)^2) / 3) ≈ 0.0816
    expect(entry.totalScore).toBeCloseTo(0.9);
    expect(entry.totalScoreErrorBar).toBeCloseTo(0.0816, 3);
    expect(entry.scores.cat1).toBeCloseTo(0.9);
    expect(entry.scoreErrorBars.cat1).toBeCloseTo(0.0816, 3);
  });

  it("returns multiple models sorted by name", async () => {
    const t = convexTest(schema, modules);

    const token = await t.mutation(internal.auth.createToken, {
      name: "test-token",
    });

    await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "zebra-model",
        scores: { cat1: 0.9 },
        totalScore: 0.9,
      }),
    });

    await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "alpha-model",
        scores: { cat1: 0.8 },
        totalScore: 0.8,
      }),
    });

    const response = await t.fetch("/listScores", { method: "GET" });

    expect(response.status).toBe(200);
    const body = (await response.json()) as ScoreEntry[];
    expect(body).toHaveLength(2);
    expect(body[0].model).toBe("alpha-model");
    expect(body[1].model).toBe("zebra-model");
  });

  it("includes CORS headers", async () => {
    const t = convexTest(schema, modules);

    const response = await t.fetch("/listScores", { method: "GET" });

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("filters by experiment query parameter", async () => {
    const t = convexTest(schema, modules);

    const token = await t.mutation(internal.auth.createToken, {
      name: "test-token",
    });

    // Add a default run
    await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "model-a",
        scores: { cat1: 0.9 },
        totalScore: 0.9,
      }),
    });

    // Add an experiment run
    await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "model-a",
        scores: { cat1: 0.7 },
        totalScore: 0.7,
        experiment: "no_guidelines",
      }),
    });

    // Default query should only return default runs
    const defaultResponse = await t.fetch("/listScores", { method: "GET" });
    expect(defaultResponse.status).toBe(200);
    const defaultBody = (await defaultResponse.json()) as ScoreEntry[];
    expect(defaultBody).toHaveLength(1);
    expect(defaultBody[0].totalScore).toBe(0.9);

    // Query with experiment filter
    const expResponse = await t.fetch("/listScores?experiment=no_guidelines", {
      method: "GET",
    });
    expect(expResponse.status).toBe(200);
    const expBody = (await expResponse.json()) as ScoreEntry[];
    expect(expBody).toHaveLength(1);
    expect(expBody[0].totalScore).toBe(0.7);
  });

  it("ignores invalid experiment values", async () => {
    const t = convexTest(schema, modules);

    const token = await t.mutation(internal.auth.createToken, {
      name: "test-token",
    });

    await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "model-a",
        scores: { cat1: 0.9 },
        totalScore: 0.9,
      }),
    });

    // Invalid experiment value should be treated as undefined (returns default runs)
    const response = await t.fetch("/listScores?experiment=invalid_value", {
      method: "GET",
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as ScoreEntry[];
    expect(body).toHaveLength(1);
  });
});

type RunEntry = {
  _id: string;
  model: string;
  totalScore: number;
  scores: Record<string, number>;
  runId?: string;
  experiment?: string;
  _creationTime: number;
};

describe("GET /listRuns", () => {
  it("returns empty array when no runs exist", async () => {
    const t = convexTest(schema, modules);

    const response = await t.fetch("/listRuns", { method: "GET" });

    expect(response.status).toBe(200);
    const body = (await response.json()) as RunEntry[];
    expect(body).toEqual([]);
  });

  it("returns all runs ordered by creation time desc", async () => {
    const t = convexTest(schema, modules);

    const token = await t.mutation(internal.auth.createToken, {
      name: "test-token",
    });

    await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "model-a",
        scores: { cat1: 0.8 },
        totalScore: 0.8,
        runId: "run-1",
      }),
    });

    await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "model-a",
        scores: { cat1: 0.9 },
        totalScore: 0.9,
        runId: "run-2",
      }),
    });

    const response = await t.fetch("/listRuns", { method: "GET" });

    expect(response.status).toBe(200);
    const body = (await response.json()) as RunEntry[];
    expect(body).toHaveLength(2);
    expect(body[0].runId).toBe("run-2"); // Most recent first
    expect(body[1].runId).toBe("run-1");
  });

  it("filters by experiment query parameter", async () => {
    const t = convexTest(schema, modules);

    const token = await t.mutation(internal.auth.createToken, {
      name: "test-token",
    });

    // Add a default run
    await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "model-a",
        scores: { cat1: 0.9 },
        totalScore: 0.9,
        runId: "default-run",
      }),
    });

    // Add an experiment run
    await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "model-a",
        scores: { cat1: 0.7 },
        totalScore: 0.7,
        runId: "exp-run",
        experiment: "no_guidelines",
      }),
    });

    // Default query should only return default runs
    const defaultResponse = await t.fetch("/listRuns", { method: "GET" });
    expect(defaultResponse.status).toBe(200);
    const defaultBody = (await defaultResponse.json()) as RunEntry[];
    expect(defaultBody).toHaveLength(1);
    expect(defaultBody[0].runId).toBe("default-run");

    // Query with experiment filter
    const expResponse = await t.fetch("/listRuns?experiment=no_guidelines", {
      method: "GET",
    });
    expect(expResponse.status).toBe(200);
    const expBody = (await expResponse.json()) as RunEntry[];
    expect(expBody).toHaveLength(1);
    expect(expBody[0].runId).toBe("exp-run");
    expect(expBody[0].experiment).toBe("no_guidelines");
  });

  it("returns all runs when includeAll=true", async () => {
    const t = convexTest(schema, modules);

    const token = await t.mutation(internal.auth.createToken, {
      name: "test-token",
    });

    // Add a default run
    await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "model-a",
        scores: { cat1: 0.9 },
        totalScore: 0.9,
      }),
    });

    // Add an experiment run
    await t.fetch("/updateScores", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({
        model: "model-a",
        scores: { cat1: 0.7 },
        totalScore: 0.7,
        experiment: "no_guidelines",
      }),
    });

    const response = await t.fetch("/listRuns?includeAll=true", {
      method: "GET",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as RunEntry[];
    expect(body).toHaveLength(2);
  });

  it("respects limit query parameter", async () => {
    const t = convexTest(schema, modules);

    const token = await t.mutation(internal.auth.createToken, {
      name: "test-token",
    });

    for (let i = 0; i < 5; i++) {
      await t.fetch("/updateScores", {
        method: "POST",
        headers: { Authorization: `Bearer ${token.value}` },
        body: JSON.stringify({
          model: "model-a",
          scores: { cat1: i * 0.1 },
          totalScore: i * 0.1,
        }),
      });
    }

    const response = await t.fetch("/listRuns?limit=2", { method: "GET" });

    expect(response.status).toBe(200);
    const body = (await response.json()) as RunEntry[];
    expect(body).toHaveLength(2);
  });

  it("includes CORS headers", async () => {
    const t = convexTest(schema, modules);

    const response = await t.fetch("/listRuns", { method: "GET" });

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
