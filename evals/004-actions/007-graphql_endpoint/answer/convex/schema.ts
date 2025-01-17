import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  authors: defineTable({
    name: v.string(),
    email: v.string(),
    bio: v.optional(v.string()),
    joinedAt: v.number(),
  }).index("by_email", ["email"]),

  books: defineTable({
    authorId: v.id("authors"),
    title: v.string(),
    genre: v.string(),
    publishedYear: v.number(),
    rating: v.number(),
    isPublished: v.boolean(),
  })
    .index("by_author", ["authorId"])
    .index("by_genre", ["genre"])
    .index("by_published", ["isPublished"]),

  reviews: defineTable({
    bookId: v.id("books"),
    userId: v.string(),
    rating: v.number(),
    comment: v.string(),
    createdAt: v.number(),
  })
    .index("by_book", ["bookId"])
    .index("by_user", ["userId"]),
}); 