import { query } from "./_generated/server";
import { v } from "convex/values";

export const getAllMessages = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("messages"),
      _creationTime: v.number(),
      author: v.string(),
      body: v.string(),
    })
  ),
  handler: async (ctx) => {
    return ctx.db.query("messages").order("desc").collect();
  },
});