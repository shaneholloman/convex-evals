import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// Helper to convert milliseconds to minutes
const msToMinutes = (ms: number) => Math.floor(ms / (1000 * 60));

// Validation error class
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export const createEvent = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    capacity: v.number(),
    minAge: v.number(),
    organizerId: v.id("users"),
    categoryId: v.id("categories"),
    venue: v.object({
      name: v.string(),
      address: v.string(),
      capacity: v.number(),
      accessible: v.boolean(),
    }),
  },
  handler: async (ctx, args) => {
    // 1. Basic string/number validation
    if (args.title.length < 5 || args.title.length > 100) {
      throw new ValidationError("Title must be between 5-100 characters");
    }
    if (args.description.length > 1000) {
      throw new ValidationError("Description must not exceed 1000 characters");
    }
    if (args.capacity < 1 || args.capacity > 1000) {
      throw new ValidationError("Capacity must be between 1-1000");
    }
    if (args.minAge < 0 || args.minAge > 100) {
      throw new ValidationError("Minimum age must be between 0-100");
    }

    // 2. Venue validation
    if (!args.venue.name.trim()) {
      throw new ValidationError("Venue name is required");
    }
    if (!args.venue.address.trim()) {
      throw new ValidationError("Venue address is required");
    }
    if (args.capacity > args.venue.capacity) {
      throw new ValidationError(
        `Event capacity (${args.capacity}) cannot exceed venue capacity (${args.venue.capacity})`
      );
    }

    // 3. Time validation
    const now = Date.now();
    if (args.startTime <= now) {
      throw new ValidationError("Event must start in the future");
    }
    if (args.endTime <= args.startTime) {
      throw new ValidationError("End time must be after start time");
    }

    // 4. Get and validate category
    const category = await ctx.db.get(args.categoryId);
    if (!category) {
      throw new ValidationError("Category not found");
    }

    // 5. Duration validation
    const durationMinutes = msToMinutes(args.endTime - args.startTime);
    if (durationMinutes < category.minDuration) {
      throw new ValidationError(
        `Event duration (${durationMinutes} min) below category minimum (${category.minDuration} min)`
      );
    }
    if (durationMinutes > category.maxDuration) {
      throw new ValidationError(
        `Event duration (${durationMinutes} min) exceeds category maximum (${category.maxDuration} min)`
      );
    }

    // 6. Get and validate organizer
    const organizer = await ctx.db.get(args.organizerId);
    if (!organizer) {
      throw new ValidationError("Organizer not found");
    }
    if (!organizer.verifiedOrganizer) {
      throw new ValidationError("Organizer must be verified to create events");
    }

    // 7. Check moderator requirement
    if (category.requiresModeration && organizer.role !== "moderator") {
      throw new ValidationError(
        "This category requires events to be created by a moderator"
      );
    }

    // 8. Check for overlapping events
    const overlappingEvents = await ctx.db
      .query("events")
      .withIndex("by_organizer", (q) =>
        q
          .eq("organizerId", args.organizerId)
          .gt("startTime", args.startTime - 1000 * 60 * 60) // 1 hour buffer
          .lt("startTime", args.endTime + 1000 * 60 * 60)
      )
      .filter((q) =>
        q.or(
          q.and(
            q.gte(q.field("startTime"), args.startTime),
            q.lt(q.field("startTime"), args.endTime)
          ),
          q.and(
            q.gt(q.field("endTime"), args.startTime),
            q.lte(q.field("endTime"), args.endTime)
          )
        )
      )
      .collect();

    if (overlappingEvents.length > 0) {
      throw new ValidationError(
        "Event overlaps with organizer's existing events"
      );
    }

    // 9. Create the event
    const event = await ctx.db.insert("events", {
      ...args,
      status: "draft",
    });

    // 10. Simulate email notification
    console.log(
      `Event created: "${args.title}" by ${organizer.name} (${organizer.email})`
    );
    if (category.requiresModeration) {
      console.log("Moderation required - notifying moderators");
    }

    return {
      ...event,
      requiresModeration: category.requiresModeration,
    };
  },
}); 