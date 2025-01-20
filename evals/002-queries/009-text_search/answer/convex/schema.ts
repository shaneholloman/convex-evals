import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  articles: defineTable({
    title: v.string(),
    content: v.string(),
    author: v.string(),
    tags: v.array(v.string()),
    isPublished: v.boolean(),
  }).searchIndex("search_articles", {
    searchField: "content",
    filterFields: ["author", "isPublished"],
  }),
});
