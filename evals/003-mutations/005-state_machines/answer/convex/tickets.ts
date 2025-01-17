import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// Valid ticket states
const ticketStates = [
  "new",
  "assigned",
  "in_progress",
  "blocked",
  "resolved",
  "closed",
] as const;
type TicketStatus = typeof ticketStates[number];

// State transition validation error
class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitionError";
  }
}

// Helper to check if a transition is valid
function isValidTransition(
  fromState: TicketStatus,
  toState: TicketStatus,
  userRole: string,
  metadata?: Record<string, any>
): boolean {
  // Admin can do any transition
  if (userRole === "admin") return true;

  switch (toState) {
    case "assigned":
      // Only agents/admins can assign tickets
      return (
        fromState === "new" && (userRole === "agent" || userRole === "admin")
      );

    case "in_progress":
      // Must be assigned first
      return fromState === "assigned";

    case "blocked":
      // Any state can be blocked but needs reason
      return !!metadata?.reason;

    case "resolved":
      // Any state can be resolved but needs resolution
      return !!metadata?.resolution;

    case "closed":
      // Only resolved tickets can be closed
      return fromState === "resolved";

    default:
      // Closed tickets can only be reopened by admin (handled above)
      if (fromState === "closed") return false;
      
      return true;
  }
}

export const updateTicketStatus = mutation({
  args: {
    ticketId: v.id("tickets"),
    newStatus: v.union(...ticketStates.map((s) => v.literal(s))),
    comment: v.optional(v.string()),
    metadata: v.optional(
      v.object({
        reason: v.optional(v.string()),
        blockedBy: v.optional(v.string()),
        resolution: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Get the ticket
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new TransitionError("Ticket not found");
    }

    // Get the user (simulated auth context)
    const user = await ctx.db.get(ctx.auth.getUserIdentity()?.subject as Id<"users">);
    if (!user || !user.active) {
      throw new TransitionError("User not found or inactive");
    }

    // Validate the transition
    if (!isValidTransition(ticket.status, args.newStatus, user.role, args.metadata)) {
      throw new TransitionError(
        `Invalid transition from ${ticket.status} to ${args.newStatus}`
      );
    }

    // Additional validation for specific transitions
    if (args.newStatus === "in_progress") {
      // Only assignee can start work
      if (ticket.assigneeId !== user.id && user.role !== "admin") {
        throw new TransitionError("Only the assignee can start work on a ticket");
      }
    }

    // Create state change record
    const stateChange = await ctx.db.insert("stateChanges", {
      ticketId: args.ticketId,
      fromState: ticket.status,
      toState: args.newStatus,
      userId: user.id,
      timestamp: Date.now(),
      comment: args.comment,
      metadata: args.metadata,
    });

    // Update the ticket
    const updatedTicket = await ctx.db.patch(args.ticketId, {
      status: args.newStatus,
      updatedAt: Date.now(),
    });

    // Handle auto-closure after 24h if resolved
    if (args.newStatus === "resolved") {
      // In a real system, this would be handled by a scheduled task
      console.log(
        `Ticket ${args.ticketId} will auto-close in 24h if no issues are reported`
      );
    }

    return {
      ticket: updatedTicket,
      stateChange,
      previousState: ticket.status,
    };
  },
}); 