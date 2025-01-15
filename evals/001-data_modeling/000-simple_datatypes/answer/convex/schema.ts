import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  example: defineTable({
    a: v.null(),
    b: v.number(),
    c: v.float64(),
    d: v.int64(),
    e: v.int64(),
    f: v.boolean(),
    g: v.string(),
    h: v.bytes(),
    i: v.any()
  })
});