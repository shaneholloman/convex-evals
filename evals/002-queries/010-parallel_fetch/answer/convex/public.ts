import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { Id } from "./_generated/dataModel"

export const insertTestData = mutation({
  handler: async (ctx) => {
    // Create users
    const user1Id = await ctx.db.insert("users", {
      name: "Alice Johnson",
      email: "alice@example.com",
    })
    const user2Id = await ctx.db.insert("users", {
      name: "Bob Smith",
      email: "bob@example.com",
    })
    const user3Id = await ctx.db.insert("users", {
      name: "Carol Davis",
      email: "carol@example.com",
    })

    // Create user preferences
    await ctx.db.insert("userPreferences", {
      userId: user1Id,
      theme: "dark",
      notifications: true,
    })
    await ctx.db.insert("userPreferences", {
      userId: user2Id,
      theme: "light",
      notifications: false,
    })
    await ctx.db.insert("userPreferences", {
      userId: user3Id,
      theme: "system",
      notifications: true,
    })

    // Create posts for each user
    const post1Id = await ctx.db.insert("posts", {
      authorId: user1Id,
      title: "Getting Started",
      content: "This is my first post!",
    })
    const post2Id = await ctx.db.insert("posts", {
      authorId: user1Id,
      title: "Advanced Topics",
      content: "Let's dive deeper...",
    })
    const post3Id = await ctx.db.insert("posts", {
      authorId: user2Id,
      title: "My Journey",
      content: "It's been interesting...",
    })
    const post4Id = await ctx.db.insert("posts", {
      authorId: user2Id,
      title: "Tips and Tricks",
      content: "Here's what I learned...",
    })
    const post5Id = await ctx.db.insert("posts", {
      authorId: user3Id,
      title: "Best Practices",
      content: "Always remember to...",
    })
    const post6Id = await ctx.db.insert("posts", {
      authorId: user3Id,
      title: "Quick Update",
      content: "Just wanted to share...",
    })

    // Add reactions to posts
    await ctx.db.insert("reactions", {
      postId: post1Id,
      userId: user2Id,
      type: "like",
    })
    await ctx.db.insert("reactions", {
      postId: post1Id,
      userId: user3Id,
      type: "heart",
    })
    await ctx.db.insert("reactions", {
      postId: post2Id,
      userId: user3Id,
      type: "celebrate",
    })
    await ctx.db.insert("reactions", {
      postId: post3Id,
      userId: user1Id,
      type: "like",
    })
    await ctx.db.insert("reactions", {
      postId: post4Id,
      userId: user3Id,
      type: "heart",
    })
    await ctx.db.insert("reactions", {
      postId: post5Id,
      userId: user1Id,
      type: "celebrate",
    })
  },
})

export const getAuthorDashboard = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // Fetch user and preferences in parallel
    const [user, preferences] = await Promise.all([
      ctx.db.get(args.userId),
      ctx.db
        .query("userPreferences")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .unique(),
    ])

    if (!user) return null

    // Fetch all posts by the author
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_author", (q) => q.eq("authorId", args.userId))
      .collect()

    // For each post, fetch reactions and reactor details in parallel
    const postsWithReactions = await Promise.all(
      posts.map(async (post) => {
        const reactions = await ctx.db
          .query("reactions")
          .withIndex("by_post", (q) => q.eq("postId", post._id))
          .collect()

        // Count reactions by type
        const reactionCounts = reactions.reduce((acc, reaction) => {
          acc[reaction.type] = (acc[reaction.type] || 0) + 1
          return acc
        }, {} as Record<string, number>)

        // Get recent reactor details in parallel
        const recentReactors = await Promise.all(
          reactions
            .slice(-3)
            .map((reaction) => ctx.db.get(reaction.userId))
        )

        return {
          ...post,
          reactionCounts,
          recentReactors: recentReactors
            .filter((user): user is NonNullable<typeof user> => user !== null)
            .map((user) => user.name),
        }
      })
    )

    return {
      user: {
        ...user,
        preferences: preferences ?? null,
      },
      posts: postsWithReactions,
    }
  },
})
