import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";

export const paginateItems = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return ctx.db.query("items").order("desc").paginate(args.paginationOpts);
  },
});
