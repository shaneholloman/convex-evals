import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

export const generateUploadUrl = mutation({
    args: {},
    returns: v.string(),
    handler: async (ctx, args) => {
        const url = await ctx.storage.generateUploadUrl();
        return url;
    }
})

export const finishUpload = mutation({
    args: {
        storageId: v.id("_storage"),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        await ctx.db.insert("files", {
            storageId: args.storageId,
        });
    }
})