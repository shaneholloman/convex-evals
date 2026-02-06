/**
 * Maintenance tasks for the runs table.
 * Called by cron jobs to clean up stuck or stale runs.
 */
import { internalMutation } from "./_generated/server";

/** Maximum age (in ms) before a pending/running run is considered stuck (3 hours) */
const STUCK_RUN_THRESHOLD_MS = 3 * 60 * 60 * 1000;

/**
 * Find runs that have been in "pending" or "running" state for longer than
 * the threshold and mark them as failed. This handles cases where the
 * runner process crashed or was killed without completing the run.
 */
export const failStuckRuns = internalMutation({
  args: {},
  returns: undefined,
  handler: async (ctx) => {
    const cutoff = Date.now() - STUCK_RUN_THRESHOLD_MS;

    // Query all runs created before the cutoff
    // We scan all runs ordered desc and stop once we hit ones newer than cutoff
    const oldRuns = await ctx.db
      .query("runs")
      .order("desc")
      .collect();

    let failedCount = 0;
    for (const run of oldRuns) {
      // Skip runs newer than the cutoff
      if (run._creationTime > cutoff) continue;

      // Only fail runs that are still pending or running
      if (run.status.kind !== "pending" && run.status.kind !== "running") continue;

      const elapsedMs = Date.now() - run._creationTime;
      await ctx.db.patch(run._id, {
        status: {
          kind: "failed",
          failureReason: `Run stuck in "${run.status.kind}" state for ${Math.round(elapsedMs / 1000 / 60)} minutes — auto-failed by maintenance cron`,
          durationMs: elapsedMs,
        },
      });
      failedCount++;
    }

    if (failedCount > 0) {
      console.log(`failStuckRuns: marked ${failedCount} stuck run(s) as failed`);
    }
  },
});
