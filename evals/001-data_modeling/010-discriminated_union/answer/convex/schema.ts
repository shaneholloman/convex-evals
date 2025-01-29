import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  notifications: defineTable(
    // Define the discriminated union using union and object validators
    v.union(
      v.object({
        kind: v.literal("message"),
        senderId: v.string(),
        messageText: v.string(),
      }),
      v.object({
        kind: v.literal("friendRequest"),
        requesterId: v.string(),
      }),
      v.object({
        kind: v.literal("achievement"),
        achievementName: v.string(),
        points: v.number(),
      })
    ),
  )
});