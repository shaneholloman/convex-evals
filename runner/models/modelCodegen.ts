/**
 * LLM code generation: builds prompts, calls provider APIs, parses responses.
 */
import OpenAI from "openai";
import MarkdownIt from "markdown-it";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, relative } from "path";
import {
  type ModelTemplate,
  ModelProvider,
  SYSTEM_PROMPT,
  getProviderBaseUrl,
} from "./index.js";
import { CONVEX_GUIDELINES, renderGuidelines } from "./guidelines.js";

// ── Retry config ──────────────────────────────────────────────────────

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 60000;
const RETRY_JITTER_FACTOR = 0.25;

// ── Guidelines helpers ────────────────────────────────────────────────

function shouldSkipGuidelines(): boolean {
  return process.env.EVALS_EXPERIMENT === "no_guidelines";
}

function getGuidelinesContent(): string {
  const customPath = process.env.CUSTOM_GUIDELINES_PATH;
  if (customPath && existsSync(customPath)) {
    return readFileSync(customPath, "utf-8");
  }
  if (shouldSkipGuidelines()) return "";
  return renderGuidelines(CONVEX_GUIDELINES);
}

// ── Model class ───────────────────────────────────────────────────────

export class Model {
  private client: OpenAI;
  private model: ModelTemplate;

  constructor(apiKey: string, model: ModelTemplate) {
    this.model = model;

    const baseURL = model.overrideProxy ?? getProviderBaseUrl(model.provider);

    this.client = new OpenAI({
      baseURL,
      apiKey,
      maxRetries: MAX_RETRIES,
      timeout: 300_000, // 5 min read timeout
    });
  }

  async generate(prompt: string): Promise<Record<string, string>> {
    const userPrompt = renderPrompt(this.model.requiresChainOfThought, prompt);

    if (this.model.usesResponsesApi) {
      return this.generateWithResponsesApi(userPrompt);
    }

    const systemMessage: OpenAI.ChatCompletionMessageParam = this.model
      .usesSystemPrompt
      ? { role: "system", content: SYSTEM_PROMPT }
      : { role: "user", content: SYSTEM_PROMPT };

    // Token limit varies by provider
    const maxTokenLimit =
      this.model.provider === ModelProvider.TOGETHER
        ? 4096
        : this.model.name === "claude-3-5-sonnet-latest"
          ? 8192
          : 16384;

    const params: Record<string, unknown> = {
      model: this.model.name,
      messages: [systemMessage, { role: "user", content: userPrompt }],
    };

    if (this.model.supportsTemperature) {
      params.temperature = parseFloat(
        process.env.EVAL_TEMPERATURE ?? "0.7",
      );
    }

    // Newer models use max_completion_tokens instead of max_tokens
    if (
      this.model.name.startsWith("gpt-5") ||
      this.model.name.startsWith("o4")
    ) {
      params.max_completion_tokens = maxTokenLimit;
    } else {
      params.max_tokens = maxTokenLimit;
    }

    const response = await this.callWithRetry(params);
    const content = (response as OpenAI.ChatCompletion).choices[0]?.message
      ?.content;
    return parseMarkdownResponse(content ?? "");
  }

  private async generateWithResponsesApi(
    userPrompt: string,
  ): Promise<Record<string, string>> {
    const params = {
      model: this.model.name,
      instructions: SYSTEM_PROMPT,
      input: userPrompt,
      max_output_tokens: 16384,
      store: false,
    };

    const response = await this.callResponsesApiWithRetry(params);
    return parseMarkdownResponse(
      (response as { output_text: string }).output_text ?? "",
    );
  }

  private async callWithRetry(
    params: Record<string, unknown>,
  ): Promise<unknown> {
    let lastError: Error = new Error("All retries exhausted");
    let delay = INITIAL_RETRY_DELAY_MS;
    const retryStatuses = new Set([429, 500, 502, 503, 504]);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await this.client.chat.completions.create(
          params as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming,
        );
      } catch (e) {
        if (e instanceof OpenAI.APIError && retryStatuses.has(Number(e.status))) {
          lastError = e;
          const jitter = delay * RETRY_JITTER_FACTOR * Math.random();
          const sleepMs = Math.min(delay + jitter, MAX_RETRY_DELAY_MS);
          console.log(
            `API error ${String(e.status)}, retrying in ${(sleepMs / 1000).toFixed(1)}s (attempt ${String(attempt + 1)}/${String(MAX_RETRIES)})`,
          );
          await Bun.sleep(sleepMs);
          delay *= 2;
          continue;
        }
        throw e;
      }
    }
    throw lastError;
  }

  private async callResponsesApiWithRetry(
    params: Record<string, unknown>,
  ): Promise<unknown> {
    let lastError: Error = new Error("All retries exhausted");
    let delay = INITIAL_RETRY_DELAY_MS;
    const retryStatuses = new Set([429, 500, 502, 503, 504]);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await (this.client.responses as { create: (p: unknown) => Promise<unknown> }).create(params);
      } catch (e) {
        if (e instanceof OpenAI.APIError && retryStatuses.has(Number(e.status))) {
          lastError = e;
          const jitter = delay * RETRY_JITTER_FACTOR * Math.random();
          const sleepMs = Math.min(delay + jitter, MAX_RETRY_DELAY_MS);
          console.log(
            `Responses API error ${String(e.status)}, retrying in ${(sleepMs / 1000).toFixed(1)}s (attempt ${String(attempt + 1)}/${String(MAX_RETRIES)})`,
          );
          await Bun.sleep(sleepMs);
          delay *= 2;
          continue;
        }
        throw e;
      }
    }
    throw lastError;
  }
}

// ── Response parsing ──────────────────────────────────────────────────

export function parseMarkdownResponse(
  response: string,
): Record<string, string> {
  const md = new MarkdownIt();
  const tokens = md.parse(response, {});

  const files: Record<string, string> = {};
  let currentFile: string | null = null;
  let inFilesSection = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === "heading_open" && token.tag === "h1") {
      const titleToken = tokens[i + 1];
      if (titleToken?.content === "Files") {
        inFilesSection = true;
        continue;
      }
    }

    if (!inFilesSection) continue;

    if (token.type === "heading_open" && token.tag === "h2") {
      const titleToken = tokens[i + 1];
      currentFile = titleToken?.content?.trim() ?? null;
    } else if (token.type === "fence" && currentFile) {
      files[currentFile] = token.content.trim();
      currentFile = null;
    }
  }

  return files;
}

// ── Prompt rendering ──────────────────────────────────────────────────

export function renderPrompt(
  chainOfThought: boolean,
  taskDescription: string,
): string {
  const parts: string[] = [];
  parts.push(
    "Your task is to generate a Convex backend from a task description.\n",
  );

  if (chainOfThought) {
    parts.push(
      "Before writing any code, analyze the task and think through your approach. Use the Analysis section to show your thought process, covering the following areas:\n",
      "1. Summarize the task requirements\n",
      "2. List out the main components needed for the backend\n",
      "3. Design the public API and internal functions:\n",
      "   - List each function with its file path, argument validators, and return validator, and purpose.\n",
      "4. Plan the schema design (if needed):\n",
      "   - List each table with its validator (excluding the included _id and _creationTime fields) and its indexes\n",
      "5. Outline background processing requirements (if any):\n",
      "After your analysis, output all files within an h1 Files section that has an h2 section for each necessary file for a Convex backend that implements the requested functionality.\n",
      "For example, correct output looks like\n",
      "# Analysis\n",
      "...\n",
      "# Files\n",
      "## package.json\n",
      "```\n...\n```\n",
      "## tsconfig.json\n",
      "```\n...\n```\n",
      "## convex/schema.ts\n",
      "```\n...\n```\n",
    );
  } else {
    parts.push(
      "Output all files within an h1 Files section that has an h2 section for each necessary file for a Convex backend that implements the requested functionality.\n",
      "For example, correct output looks like\n",
      "# Files\n",
      "## package.json\n",
      "```\n...\n```\n",
      "## tsconfig.json\n",
      "```\n...\n```\n",
      "## convex/schema.ts\n",
      "```\n...\n```\n",
    );
  }

  parts.push(renderExamples());
  parts.push("\n");

  parts.push("# General Coding Standards\n");
  parts.push("- Use 2 spaces for code indentation.\n");
  parts.push(
    "- Ensure your code is clear, efficient, concise, and innovative.\n",
  );
  parts.push(
    "- Maintain a friendly and approachable tone in any comments or documentation.\n\n",
  );

  const guidelinesContent = getGuidelinesContent();
  if (guidelinesContent) {
    parts.push(guidelinesContent, "\n");
  }

  parts.push("\n# File Structure\n");
  parts.push(
    "- You can write to `package.json`, `tsconfig.json`, and any files within the `convex/` folder.\n",
  );
  parts.push(
    "- Do NOT write to the `convex/_generated` folder. You can assume that `npx convex dev` will populate this folder.\n",
  );
  parts.push(
    "- It's VERY IMPORTANT to output files to the correct paths, as specified in the task description.\n",
  );
  parts.push(
    "- Always start with `package.json` and `tsconfig.json` files.\n",
  );
  parts.push('- Use Convex version "^1.31.2".\n\n');
  parts.push('- Use Typescript version "^5.7.3".\n\n');

  if (chainOfThought) {
    parts.push(
      "Begin your response with your thought process, then proceed to generate the necessary files for the Convex backend.\n",
    );
  }

  parts.push(
    "Now, implement a Convex backend that satisfies the following task description:\n",
  );
  parts.push(`\`\`\`\n${taskDescription}\n\`\`\`\n`);

  return parts.join("");
}

function renderExamples(): string {
  const parts: string[] = ["# Examples:\n"];
  const examplesDir = "examples";

  if (!existsSync(examplesDir)) return parts.join("");

  for (const example of readdirSync(examplesDir)) {
    const examplePath = join(examplesDir, example);
    if (!statSync(examplePath).isDirectory()) continue;

    const taskDescription = readFileSync(
      join(examplePath, "TASK.txt"),
      "utf-8",
    );
    const analysis = readFileSync(
      join(examplePath, "ANALYSIS.txt"),
      "utf-8",
    );

    const filePaths: string[] = [];
    walkDir(examplePath, (filePath) => {
      if (filePath.includes("node_modules") || filePath.includes("_generated"))
        return;
      const name = filePath.split(/[/\\]/).pop()!;
      if (
        name === "package.json" ||
        name === "tsconfig.json" ||
        name.endsWith(".ts") ||
        name.endsWith(".tsx")
      ) {
        filePaths.push(filePath);
      }
    });

    filePaths.sort((a, b) => {
      const depthA = a.split(/[/\\]/).length;
      const depthB = b.split(/[/\\]/).length;
      return depthA !== depthB ? depthA - depthB : a.localeCompare(b);
    });

    parts.push(`## Example: ${example}\n\n`);
    parts.push("### Task\n");
    parts.push(`\`\`\`\n${taskDescription}\n\`\`\`\n\n`);
    parts.push("### Analysis\n");
    parts.push(`${analysis}\n\n`);
    parts.push("### Implementation\n\n");

    for (const filePath of filePaths) {
      const relPath = relative(examplePath, filePath).replace(/\\/g, "/");
      const content = readFileSync(filePath, "utf-8").trim();
      parts.push(`#### ${relPath}\n`);
      parts.push(`\`\`\`typescript\n${content}\n\`\`\`\n\n`);
    }
  }

  return parts.join("");
}

function walkDir(dir: string, callback: (path: string) => void): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, callback);
    } else {
      callback(fullPath);
    }
  }
}

/** Render guidelines + examples for release builds. */
export function buildReleaseRules(): string {
  return renderGuidelines(CONVEX_GUIDELINES) + renderExamples();
}
