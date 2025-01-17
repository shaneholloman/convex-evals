import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

// Helper to create timestamps relative to now
const hoursAgo = (hours: number) => 
  Math.floor(Date.now() / 1000) - (hours * 3600);

export const insertTemperatures = mutation({
  handler: async (ctx) => {
    // Sensor A readings over 8 hours
    await ctx.db.insert("temperatures", {
      sensorId: "sensor_a",
      timestamp: hoursAgo(8),
      value: 22.5,
    });
    await ctx.db.insert("temperatures", {
      sensorId: "sensor_a",
      timestamp: hoursAgo(6),
      value: 23.1,
    });
    await ctx.db.insert("temperatures", {
      sensorId: "sensor_a",
      timestamp: hoursAgo(4),
      value: 24.8,
    });
    await ctx.db.insert("temperatures", {
      sensorId: "sensor_a",
      timestamp: hoursAgo(2),
      value: 25.2,
    });

    // Sensor B readings over same period
    await ctx.db.insert("temperatures", {
      sensorId: "sensor_b",
      timestamp: hoursAgo(7),
      value: 21.0,
    });
    await ctx.db.insert("temperatures", {
      sensorId: "sensor_b",
      timestamp: hoursAgo(5),
      value: 21.5,
    });
    await ctx.db.insert("temperatures", {
      sensorId: "sensor_b",
      timestamp: hoursAgo(3),
      value: 22.0,
    });
    await ctx.db.insert("temperatures", {
      sensorId: "sensor_b",
      timestamp: hoursAgo(1),
      value: 22.5,
    });
  },
});

export const getSensorReadingsInRange = query({
  args: {
    sensorId: v.string(),
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("temperatures")
      .withIndex("by_sensor_time", (q) =>
        q
          .eq("sensorId", args.sensorId)
          .gte("timestamp", args.startTime)
          .lte("timestamp", args.endTime)
      )
      .collect();
  },
});
