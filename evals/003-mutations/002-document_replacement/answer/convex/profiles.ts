import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// Type for the profile input
type ProfileInput = {
  username: string;
  displayName: string;
  bio: string;
  preferences: {
    theme: "light" | "dark";
    emailNotifications: boolean;
    visibility: "public" | "private";
  };
};

export const replaceProfile = mutation({
  args: {
    profileId: v.id("profiles"),
    profile: v.object({
      username: v.string(),
      displayName: v.string(),
      bio: v.string(),
      preferences: v.object({
        theme: v.union(v.literal("light"), v.literal("dark")),
        emailNotifications: v.boolean(),
        visibility: v.union(v.literal("public"), v.literal("private")),
      }),
    }),
    expectedVersion: v.number(),
  },
  handler: async (ctx, args) => {
    // Validate input fields
    const { username, displayName, bio, preferences } = args.profile;
    
    if (username.length < 3 || username.length > 20) {
      throw new Error("Username must be between 3-20 characters");
    }
    if (displayName.length < 1 || displayName.length > 50) {
      throw new Error("Display name must be between 1-50 characters");
    }
    if (bio.length > 500) {
      throw new Error("Bio must not exceed 500 characters");
    }

    // Check username uniqueness (excluding current profile)
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .filter((q) => q.neq(q.field("_id"), args.profileId))
      .first();
    if (existing) {
      throw new Error("Username already taken");
    }

    // Get current profile
    const currentProfile = await ctx.db.get(args.profileId);
    if (!currentProfile) {
      throw new Error("Profile not found");
    }

    // Check version
    if (currentProfile.version !== args.expectedVersion) {
      throw new Error(
        `Concurrent modification: expected version ${args.expectedVersion} but found ${currentProfile.version}`
      );
    }

    // Replace the profile with new data
    const updatedProfile = await ctx.db.replace(args.profileId, {
      ...args.profile,
      version: currentProfile.version + 1,
      lastModified: Date.now(),
    });

    return updatedProfile;
  },
}); 