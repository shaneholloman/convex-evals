import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  temperatures: defineTable({
    sensorId: v.string(),
    timestamp: v.number(), // Unix timestamp in seconds
    value: v.number(), // Temperature in Celsius
  }).index("by_sensor_time", ["sensorId", "timestamp"]),
});
