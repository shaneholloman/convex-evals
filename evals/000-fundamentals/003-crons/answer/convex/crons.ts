import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";

export const emptyAction = internalAction({
  args: {
    scheduleDescription: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.log(args.scheduleDescription);
  },
});

const crons = cronJobs();

crons.interval("run every second", { seconds: 1 }, internal.crons.emptyAction);

crons.interval("run every minute", { minutes: 1 }, internal.crons.emptyAction, {
  scheduleDescription: "run every minute",
});

crons.interval("run every hour", { hours: 1 }, internal.crons.emptyAction, {
  scheduleDescription: "run every hour",
});

crons.hourly(
  "run every hour at 10 minutes",
  { minuteUTC: 10 },
  internal.crons.emptyAction,
  { scheduleDescription: "run every hour at 10 minutes" },
);

crons.daily(
  "run every day at 7:30am UTC",
  { hourUTC: 7, minuteUTC: 30 },
  internal.crons.emptyAction,
  { scheduleDescription: "run every day at 7:30am UTC" },
);

crons.weekly(
  "run every week on Monday at 10:17pm UTC",
  { dayOfWeek: "monday", hourUTC: 22, minuteUTC: 17 },
  internal.crons.emptyAction,
  { scheduleDescription: "run every week on Monday at 10:17pm UTC" },
);

crons.monthly(
  "run every month on the 23rd day at 11:30am UTC",
  { day: 23, hourUTC: 11, minuteUTC: 30 },
  internal.crons.emptyAction,
  { scheduleDescription: "run every month on the 23rd day at 11:30am UTC" },
);

crons.cron(
  "run every month on the 11th day at 1pm UTC",
  "0 13 11 * *",
  internal.crons.emptyAction,
  { scheduleDescription: "run every month on the 11th day at 1pm UTC" },
);

export default crons;
