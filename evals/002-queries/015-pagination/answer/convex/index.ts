import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";

export const paginateDocuments = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    // Query documents with cursor if provided
    const documentsQuery = ctx.db
      .query("documents")
      .order("desc")
      .paginate(args.paginationOpts);

    return documentsQuery;
  },
});