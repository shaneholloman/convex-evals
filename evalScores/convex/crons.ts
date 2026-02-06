import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Every hour, check for runs stuck in pending/running state for too long
// and mark them as failed. This catches runs where the runner process
// crashed or timed out without properly completing the run.
crons.interval(
  "fail stuck runs",
  { hours: 1 },
  internal.runMaintenance.failStuckRuns,
);

export default crons;
