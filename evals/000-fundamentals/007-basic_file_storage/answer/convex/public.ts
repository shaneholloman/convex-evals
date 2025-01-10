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

export const getFileUrl = query({
    args: {
        fileId: v.id("files"),
    },
    returns: v.string(),
    handler: async (ctx, args) => {
        const file = await ctx.db.get(args.fileId);
        if (!file) {
            throw new Error("File not found");
        }   
        const url = await ctx.storage.getUrl(file.storageId);
        if (!url) {
            throw new Error("File not found");
        }
        return url;
    }
})

export const getFileMetadata = query({
    args: {
        fileId: v.id("files"),
    },    
    returns: v.object({
        _id: v.id("_storage"),
        _creationTime: v.number(),
        contentType: v.optional(v.string()),
        sha256: v.string(),
        size: v.number(),
    }),
    handler: async (ctx, args) => {
        const file = await ctx.db.get(args.fileId);
        if (!file) {
            throw new Error("File not found");
        }
        const metadata = await ctx.db.system.get(file.storageId);
        if (!metadata) {
            throw new Error("File not found");
        }
        return metadata;
    }
})

export const deleteFile = mutation({
    args: {
        fileId: v.id("files"),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const file = await ctx.db.get(args.fileId);
        if (!file) {
            throw new Error("File not found");
        }                
        await ctx.storage.delete(file.storageId);
        await ctx.db.delete(args.fileId);   
    }
})