import { ConvexHttpClient } from "convex/browser";
import { api } from "../evalScores/convex/_generated/api.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = DAY_MS;
const MAX_INTERVAL_MS = 60 * DAY_MS;
// Age at which the interval reaches halfway between min and max.
// f(age) = MIN + (MAX - MIN) * age / (age + HALF_SATURATION)
// → f(365d) ≈ 30d, f(180d) ≈ 20d, f(30d) ≈ 5.5d, f(∞) → 60d
const HALF_SATURATION_MS = 365 * DAY_MS;

export interface SchedulingDecision {
  isDue: boolean;
  lastRunTime: number | null;
  openRouterFirstSeenAt: number | null;
  targetIntervalMs: number;
}

export interface SchedulingMetadata {
  decision: SchedulingDecision;
  modelExists: boolean;
}

export function computeTargetIntervalMs(
  openRouterFirstSeenAt: number | null,
  now = Date.now(),
): number {
  if (openRouterFirstSeenAt === null) return MIN_INTERVAL_MS;
  const ageMs = Math.max(0, now - openRouterFirstSeenAt);
  return MIN_INTERVAL_MS + (MAX_INTERVAL_MS - MIN_INTERVAL_MS) * ageMs / (ageMs + HALF_SATURATION_MS);
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
  const metadata = await loadSchedulingMetadata(client, slugs, now);
  return new Map(
    Array.from(metadata.entries()).map(([slug, value]) => [slug, value.decision]),
  );
}

export async function loadSchedulingMetadata(
  client: ConvexHttpClient,
  slugs: string[],
  now = Date.now(),
): Promise<Map<string, SchedulingMetadata>> {
  const uniqueSlugs = [...new Set(slugs)];
  const modelDocs = await Promise.all(
    uniqueSlugs.map((slug) => client.query(api.models.getBySlug, { slug })),
  );
  const latestRunTimes = await Promise.all(
    modelDocs.map((modelDoc) =>
      modelDoc === null
        ? Promise.resolve(null)
        : client.query(api.runs.getLatestRunTime, { modelId: modelDoc._id }),
    ),
  );

  return new Map(
    uniqueSlugs.map((slug, index) => {
      const modelDoc = modelDocs[index];
      return [
        slug,
        {
          decision: getSchedulingDecision(
            latestRunTimes[index],
            modelDoc?.openRouterFirstSeenAt ?? null,
            now,
          ),
          modelExists: modelDoc !== null,
        },
      ] as const;
    }),
  );
}
