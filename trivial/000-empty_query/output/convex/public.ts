import { v } from "convex/values"
import { query } from "./_generated/server"

export const emptyQuery = query({
    args: {},
    returns: v.null(),
    handler: (ctx, args) => {
    }
})