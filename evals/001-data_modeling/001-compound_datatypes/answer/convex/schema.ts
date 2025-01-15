import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  example: defineTable({
    a: v.object({
      artist: v.number(),
      tags: v.array(v.string()),
    }),    
    b: v.array(
      v.object({
        x: v.number(),
        y: v.number(),
      })
    ),    
    c: v.record(
      v.id("example"),
      v.object({
        z: v.bytes(),
      })
    ),    
    d: v.record(v.string(), v.string()),
    e: v.union(
      v.object({
        type: v.literal("a"),
        value: v.number(),
      }),
      v.object({
        type: v.literal("b"),
        value: v.string(),
      })
    ),
    f: v.union(v.string(), v.number()),
  }),
});