import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// Simple GraphQL-like query parser
type QueryNode = {
  type: string;
  id?: string;
  fields: string[];
  relationships: Record<string, QueryNode>;
};

function parseQuery(query: string): QueryNode {
  // This is a simplified parser that expects a specific format
  // In a real implementation, use a proper GraphQL parser
  const lines = query.split("\n").map(l => l.trim()).filter(l => l);
  const root: QueryNode = { type: "", fields: [], relationships: {} };
  
  let currentNode = root;
  let depth = 0;
  
  for (const line of lines) {
    if (line.includes("{")) {
      const match = line.match(/(\w+)(?:\(id:\s*"([^"]+)"\))?\s*{/);
      if (match) {
        const [_, type, id] = match;
        const node: QueryNode = { type, fields: [], relationships: {} };
        if (id) node.id = id;
        
        if (depth === 0) {
          Object.assign(root, node);
        } else {
          currentNode.relationships[type] = node;
        }
        currentNode = node;
        depth++;
      }
    } else if (line === "}") {
      depth--;
      // Reset to root if we're back at top level
      if (depth === 0) currentNode = root;
    } else {
      // Field
      currentNode.fields.push(line);
    }
  }
  
  return root;
}

async function resolveNode(
  ctx: any,
  node: QueryNode,
  parentData?: any
): Promise<any> {
  let data: any;
  
  // Get base data
  if (node.type === "book" && node.id) {
    data = await ctx.runQuery(api.queries.getBookById, { id: node.id as Id<"books"> });
  } else if (node.type === "author" && node.id) {
    data = await ctx.runQuery(api.queries.getAuthorById, { id: node.id as Id<"authors"> });
  } else if (node.type === "reviews" && parentData?.["_id"]) {
    data = await ctx.runQuery(api.queries.getReviewsByBook, { bookId: parentData["_id"] });
  } else if (node.type === "author" && parentData?.authorId) {
    data = await ctx.runQuery(api.queries.getAuthorById, { id: parentData.authorId });
  }
  
  if (!data) {
    return null;
  }
  
  // Handle arrays
  if (Array.isArray(data)) {
    return Promise.all(
      data.map(async item => {
        const result: any = {};
        // Add requested fields
        for (const field of node.fields) {
          if (field in item) {
            result[field] = item[field];
          }
        }
        // Resolve relationships
        for (const [key, relationNode] of Object.entries(node.relationships)) {
          result[key] = await resolveNode(ctx, relationNode, item);
        }
        return result;
      })
    );
  }
  
  // Handle single object
  const result: any = {};
  // Add requested fields
  for (const field of node.fields) {
    if (field in data) {
      result[field] = data[field];
    }
  }
  // Resolve relationships
  for (const [key, relationNode] of Object.entries(node.relationships)) {
    result[key] = await resolveNode(ctx, relationNode, data);
  }
  
  return result;
}

export const graphql = httpAction(async (ctx, request) => {
  // Only accept POST requests
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  
  try {
    const body = await request.json();
    const { query, variables } = body;
    
    if (typeof query !== "string") {
      throw new Error("Query must be a string");
    }
    
    // Parse query
    const queryNode = parseQuery(query);
    
    // Execute query
    const data = await resolveNode(ctx, queryNode);
    
    // Return response
    return new Response(
      JSON.stringify({ data }, null, 2),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("GraphQL error:", error);
    return new Response(
      JSON.stringify({
        errors: [
          {
            message: error instanceof Error ? error.message : "Unknown error",
          },
        ],
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}); 