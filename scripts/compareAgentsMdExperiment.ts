#!/usr/bin/env bun
/**
 * Fetch leaderboard scores for default (full guidelines), no_guidelines, and
 * agents_md experiments from the Convex backend and print a comparison table.
 *
 * Requires CONVEX_EVAL_URL (production deployment URL). No auth needed for
 * public queries.
 *
 *   CONVEX_EVAL_URL=https://xxx.convex.cloud bun run scripts/compareAgentsMdExperiment.ts
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../evalScores/convex/_generated/api.js";

const MODELS_OF_INTEREST = [
  "gpt-5.2-codex",
  "claude-opus-4-6",
  "claude-sonnet-4-5",
  "gemini-3-pro-preview",
  "kimi-k2.5",
];

type LeaderboardRow = {
  model: string;
  formattedName: string;
  totalScore: number;
  totalScoreErrorBar: number;
  runCount: number;
  latestRunTime: number;
};

async function main(): Promise<void> {
  const url = process.env.CONVEX_EVAL_URL;
  if (!url) {
    console.error("Set CONVEX_EVAL_URL to the Convex deployment URL (e.g. production).");
    process.exit(1);
  }

  const client = new ConvexHttpClient(url);

  const [defaultScores, noGuidelinesScores, agentsMdScores] = await Promise.all([
    client.query(api.runs.leaderboardScores, {}),
    client.query(api.runs.leaderboardScores, { experiment: "no_guidelines" }),
    client.query(api.runs.leaderboardScores, { experiment: "agents_md" }),
  ]);

  const toMap = (rows: LeaderboardRow[]) =>
    new Map(rows.map((r) => [r.model, r]));

  const defaultMap = toMap(defaultScores as LeaderboardRow[]);
  const noGlMap = toMap(noGuidelinesScores as LeaderboardRow[]);
  const agentsMap = toMap(agentsMdScores as LeaderboardRow[]);

  console.log("\n--- AGENTS.md experiment comparison ---\n");
  console.log(
    "Model                  | Full guidelines | No guidelines | AGENTS.md (compact) | AGENTS vs Full | AGENTS vs NoGl",
  );
  console.log(
    "                       | (totalScore)    | (totalScore)  | (totalScore)         | (diff)         | (diff)",
  );
  console.log("-".repeat(115));

  for (const model of MODELS_OF_INTEREST) {
    const full = defaultMap.get(model);
    const noGl = noGlMap.get(model);
    const agents = agentsMap.get(model);

    const fullStr = full
      ? `${(full.totalScore * 100).toFixed(1)}% (n=${full.runCount})`
      : "—";
    const noGlStr = noGl
      ? `${(noGl.totalScore * 100).toFixed(1)}% (n=${noGl.runCount})`
      : "—";
    const agentsStr = agents
      ? `${(agents.totalScore * 100).toFixed(1)}% (n=${agents.runCount})`
      : "—";

    let agentsVsFull = "—";
    let agentsVsNoGl = "—";
    if (agents && full) {
      const diff = agents.totalScore - full.totalScore;
      agentsVsFull = `${diff >= 0 ? "+" : ""}${(diff * 100).toFixed(1)}%`;
    }
    if (agents && noGl) {
      const diff = agents.totalScore - noGl.totalScore;
      agentsVsNoGl = `${diff >= 0 ? "+" : ""}${(diff * 100).toFixed(1)}%`;
    }

    const name = (full ?? noGl ?? agents)?.formattedName ?? model;
    console.log(
      `${name.padEnd(23)} | ${fullStr.padEnd(15)} | ${noGlStr.padEnd(13)} | ${agentsStr.padEnd(20)} | ${agentsVsFull.padEnd(13)} | ${agentsVsNoGl}`,
    );
  }

  console.log("\nFull guidelines = default run (no experiment).");
  console.log("No guidelines = EVALS_EXPERIMENT=no_guidelines.");
  console.log("AGENTS.md = EVALS_EXPERIMENT=agents_md (compact guidelines).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
