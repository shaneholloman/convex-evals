import { ConvexHttpClient } from "convex/browser";
import { api } from "../evalScores/convex/_generated/api.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = DAY_MS;
const MAX_INTERVAL_MS = 30 * DAY_MS;
const RAMP_WINDOW_MS = 30 * DAY_MS;

export interface SchedulingDecision {
  isDue: boolean;
  lastRunTime: number | null;
  openRouterFirstSeenAt: number | null;
  targetIntervalMs: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeTargetIntervalMs(
  openRouterFirstSeenAt: number | null,
  now = Date.now(),
): number {
  if (openRouterFirstSeenAt === null) {
    return MIN_INTERVAL_MS;
  }

  const ageMs = clamp(now - openRouterFirstSeenAt, 0, RAMP_WINDOW_MS);
  const ageRatio = ageMs / RAMP_WINDOW_MS;
  return MIN_INTERVAL_MS + ageRatio * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);
}

export function getSchedulingDecision(
  lastRunTime: number | null,
  openRouterFirstSeenAt: number | null,
  now = Date.now(),
): SchedulingDecision {
  const targetIntervalMs = computeTargetIntervalMs(openRouterFirstSeenAt, now);
  return {
    isDue: lastRunTime === null || now - lastRunTime >= targetIntervalMs,
    lastRunTime,
    openRouterFirstSeenAt,
    targetIntervalMs,
  };
}

export async function loadSchedulingDecisions(
  client: ConvexHttpClient,
  slugs: string[],
  now = Date.now(),
): Promise<Map<string, SchedulingDecision>> {
  const uniqueSlugs = [...new Set(slugs)];
  const modelDocs = await Promise.all(
    uniqueSlugs.map((slug) => client.query(api.models.getBySlug, { slug })),
  );
  const existingModelIds = modelDocs
    .filter((modelDoc) => modelDoc !== null)
    .map((modelDoc) => modelDoc._id);
  const modelSummaries =
    existingModelIds.length > 0
      ? await client.query(api.runs.listModels, { modelIds: existingModelIds })
      : [];

  return new Map(
    uniqueSlugs.map((slug, index) => {
      const modelDoc = modelDocs[index];
      const latestRun =
        modelSummaries.find((entry) => entry.slug === slug)?.latestRun ?? null;
      return [
        slug,
        getSchedulingDecision(
          latestRun,
          modelDoc?.openRouterFirstSeenAt ?? null,
          now,
        ),
      ] as const;
    }),
  );
}
