/**
 * Web search tool for the "web_search" experiment.
 * Uses the Tavily Search API to let models look up documentation and examples.
 * Defined as an AI SDK tool so it works uniformly across all providers.
 */
import { tool } from "ai";
import { z } from "zod";
import { logInfo } from "../logging.js";

// ── Tool definition (AI SDK format) ─────────────────────────────────

export const webSearchTool = tool({
  description:
    "Search the web for information about Convex APIs, TypeScript patterns, or documentation. " +
    "Use this when you need to look up specific API details, check how a Convex feature works, " +
    "or find examples of a pattern you're unsure about.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "The search query. Be specific — include 'Convex' or relevant library names.",
      ),
  }),
  execute: async ({ query }: { query: string }) => {
    logInfo(`  [web_search] Searching: "${query}"`);
    return executeWebSearch(query);
  },
});

/** Maximum number of tool-calling steps the AI SDK should take. */
export const MAX_TOOL_STEPS = 6;

/**
 * Additional system prompt text appended when the web_search experiment is
 * active. Strongly encourages the model to use the search tool.
 */
export const WEB_SEARCH_SYSTEM_SUPPLEMENT = `
You have access to a web_search tool that lets you search the internet for up-to-date information.

IMPORTANT: You MUST use the web_search tool before writing any code. Convex is a rapidly evolving framework and your training data may be outdated. Searching ensures you use the latest APIs and best practices.

Recommended searches:
1. Search for the specific Convex features mentioned in the task (e.g. "Convex scheduled functions API", "Convex HTTP actions", "Convex schema indexes").
2. Search for any Convex APIs you plan to use to confirm the correct function signatures and import paths.
3. If the task involves a pattern you're less sure about, search for examples.

You can make multiple searches. After gathering information from your searches, proceed to generate the code. Do NOT skip searching — even if you think you know the answer, verify it with a search first.
`.trim();

// ── Tavily search implementation ─────────────────────────────────────

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results: TavilySearchResult[];
  answer?: string;
}

/**
 * Execute a web search via the Tavily API.
 * Returns a formatted string with the top results.
 */
async function executeWebSearch(query: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return "Error: TAVILY_API_KEY is not set. Cannot perform web search.";
  }

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: 5,
        include_answer: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return `Search failed (HTTP ${response.status}): ${errorText}`;
    }

    const data = (await response.json()) as TavilyResponse;
    return formatSearchResults(query, data);
  } catch (e) {
    return `Search error: ${String(e)}`;
  }
}

function formatSearchResults(query: string, data: TavilyResponse): string {
  const parts: string[] = [`Search results for: "${query}"\n`];

  if (data.answer) {
    parts.push(`Summary: ${data.answer}\n`);
  }

  for (const result of data.results) {
    parts.push(`--- ${result.title} (${result.url}) ---`);
    parts.push(result.content);
    parts.push("");
  }

  return parts.join("\n").slice(0, 8000); // Cap output size
}
