import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const insertArticles = mutation({
  handler: async (ctx) => {
    // Published articles
    await ctx.db.insert("articles", {
      title: "Getting Started with React",
      content: `React is a popular JavaScript library for building user interfaces. 
        It uses a component-based architecture and virtual DOM for efficient updates. 
        This guide will help you understand the core concepts of React development.`,
      author: "alice",
      tags: ["react", "javascript", "frontend"],
      isPublished: true,
    });

    await ctx.db.insert("articles", {
      title: "Advanced TypeScript Patterns",
      content: `TypeScript extends JavaScript by adding static types. 
        This article explores advanced patterns like generics, utility types, 
        and how to effectively use the type system in large applications.`,
      author: "bob",
      tags: ["typescript", "javascript", "programming"],
      isPublished: true,
    });

    await ctx.db.insert("articles", {
      title: "React Performance Optimization",
      content: `Learn how to optimize your React applications for better performance. 
        Topics include memo, useMemo, useCallback, and effective state management 
        strategies using modern React features.`,
      author: "alice",
      tags: ["react", "performance", "optimization"],
      isPublished: true,
    });

    // Unpublished articles
    await ctx.db.insert("articles", {
      title: "Introduction to Vue.js",
      content: `Vue.js is a progressive JavaScript framework that makes building 
        user interfaces enjoyable. This guide covers Vue's reactivity system, 
        component architecture, and state management.`,
      author: "carol",
      tags: ["vue", "javascript", "frontend"],
      isPublished: false,
    });

    await ctx.db.insert("articles", {
      title: "JavaScript Best Practices",
      content: `Discover essential JavaScript best practices for writing clean, 
        maintainable code. Topics include modern ES6+ features, common pitfalls, 
        and coding standards for professional development.`,
      author: "bob",
      tags: ["javascript", "programming", "best-practices"],
      isPublished: true,
    });

    await ctx.db.insert("articles", {
      title: "Web Development Trends 2024",
      content: `Explore the latest trends in web development for 2024. 
        From new frameworks to emerging technologies, stay updated with 
        what's shaping the future of web development.`,
      author: "carol",
      tags: ["web-dev", "trends", "technology"],
      isPublished: true,
    });
  },
});

export const searchArticles = query({
  args: {
    searchTerm: v.string(),
    author: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("articles");

    // If author is provided, use the index to filter by author first
    if (args.author) {
      query = query.withIndex("by_author", (q) => q.eq("author", args.author));
    }

    // Apply filters for published status and search term
    const articles = await query
      .filter((q) => 
        q.and(
          q.eq(q.field("isPublished"), true),
          q.search("content", args.searchTerm)
        )
      )
      .collect();

    // Format the results
    return articles.map(article => ({
      title: article.title,
      author: article.author,
      preview: article.content.slice(0, 100) + "...",
      tags: article.tags,
    }));
  },
});
