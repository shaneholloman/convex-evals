import { mutation } from "./_generated/server"
import { v } from "convex/values"

export const emptyMutation = mutation({
    args: {},
    returns: v.null(),
    handler: async (ctx, args) => {        
    }
})