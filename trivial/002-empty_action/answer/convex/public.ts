import { v } from "convex/values"
import { action } from "./_generated/server"

export const emptyAction = action({
    args: {},
    returns: v.null(),
    handler: (ctx, args) => {
    }
})