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
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

// ── Guidelines helpers ────────────────────────────────────────────────

function getGuidelinesContent(): string {
  const customPath = process.env.CUSTOM_GUIDELINES_PATH;
  if (customPath && existsSync(customPath)) {
    return readFileSync(customPath, "utf-8");
  }
  if (process.env.EVALS_EXPERIMENT === "no_guidelines") return "";
  return renderGuidelines(CONVEX_GUIDELINES);
}

// ── Model class ───────────────────────────────────────────────────────

export class Model {
  private client: OpenAI;
  private model: ModelTemplate;

  constructor(apiKey: string, model: ModelTemplate) {
    this.model = model;
    this.client = new OpenAI({
      baseURL: model.overrideProxy ?? getProviderBaseUrl(model.provider),
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
    return this.generateWithChatApi(userPrompt);
  }

  private async generateWithChatApi(
    userPrompt: string,
  ): Promise<Record<string, string>> {
    const systemMessage: OpenAI.ChatCompletionMessageParam = this.model
      .usesSystemPrompt
      ? { role: "system", content: SYSTEM_PROMPT }
      : { role: "user", content: SYSTEM_PROMPT };

    const maxTokenLimit = this.getMaxTokenLimit();

    const params: Record<string, unknown> = {
      model: this.model.name,
      messages: [systemMessage, { role: "user", content: userPrompt }],
    };

    if (this.model.supportsTemperature) {
      params.temperature = parseFloat(process.env.EVAL_TEMPERATURE ?? "0.7");
    }

    // Newer models use max_completion_tokens instead of max_tokens
    const tokenKey = this.usesCompletionTokensParam()
      ? "max_completion_tokens"
      : "max_tokens";
    params[tokenKey] = maxTokenLimit;

    const response = await this.callWithRetry(() =>
      this.client.chat.completions.create(
        params as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming,
      ),
    );
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

    const response = await this.callWithRetry(() =>
      (
        this.client.responses as { create: (p: unknown) => Promise<unknown> }
      ).create(params),
    );
    return parseMarkdownResponse(
      (response as { output_text: string }).output_text ?? "",
    );
  }

  private getMaxTokenLimit(): number {
    if (this.model.provider === ModelProvider.TOGETHER) return 4096;
    if (this.model.name === "claude-3-5-sonnet-latest") return 8192;
    return 16384;
  }

  private usesCompletionTokensParam(): boolean {
    return (
      this.model.name.startsWith("gpt-5") ||
      this.model.name.startsWith("o4")
    );
  }

  /** Generic retry wrapper with exponential backoff for transient API errors. */
  private async callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error = new Error("All retries exhausted");
    let delay = INITIAL_RETRY_DELAY_MS;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (e) {
        if (
          e instanceof OpenAI.APIError &&
          RETRYABLE_STATUS_CODES.has(Number(e.status))
        ) {
          lastError = e;
          const jitter = delay * RETRY_JITTER_FACTOR * Math.random();
          const sleepMs = Math.min(delay + jitter, MAX_RETRY_DELAY_MS);
          console.log(
            `API error ${e.status}, retrying in ${(sleepMs / 1000).toFixed(1)}s (attempt ${attempt + 1}/${MAX_RETRIES})`,
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

const FILE_FORMAT_EXAMPLE = [
  "# Files",
  "## package.json",
  "```\n...\n```",
  "## tsconfig.json",
  "```\n...\n```",
  "## convex/schema.ts",
  "```\n...\n```",
].join("\n");

export function renderPrompt(
  chainOfThought: boolean,
  taskDescription: string,
): string {
  const sections: string[] = [
    "Your task is to generate a Convex backend from a task description.",
  ];

  if (chainOfThought) {
    sections.push(
      `Before writing any code, analyze the task and think through your approach. Use the Analysis section to show your thought process, covering the following areas:

1. Summarize the task requirements
2. List out the main components needed for the backend
3. Design the public API and internal functions:
   - List each function with its file path, argument validators, and return validator, and purpose.
4. Plan the schema design (if needed):
   - List each table with its validator (excluding the included _id and _creationTime fields) and its indexes
5. Outline background processing requirements (if any):
After your analysis, output all files within an h1 Files section that has an h2 section for each necessary file for a Convex backend that implements the requested functionality.
For example, correct output looks like
# Analysis
...
${FILE_FORMAT_EXAMPLE}`,
    );
  } else {
    sections.push(
      `Output all files within an h1 Files section that has an h2 section for each necessary file for a Convex backend that implements the requested functionality.
For example, correct output looks like
${FILE_FORMAT_EXAMPLE}`,
    );
  }

  sections.push(renderExamples());

  sections.push(`# General Coding Standards
- Use 2 spaces for code indentation.
- Ensure your code is clear, efficient, concise, and innovative.
- Maintain a friendly and approachable tone in any comments or documentation.`);

  const guidelinesContent = getGuidelinesContent();
  if (guidelinesContent) {
    sections.push(guidelinesContent);
  }

  sections.push(`# File Structure
- You can write to \`package.json\`, \`tsconfig.json\`, and any files within the \`convex/\` folder.
- Do NOT write to the \`convex/_generated\` folder. You can assume that \`npx convex dev\` will populate this folder.
- It's VERY IMPORTANT to output files to the correct paths, as specified in the task description.
- Always start with \`package.json\` and \`tsconfig.json\` files.
- Use Convex version "^1.31.2".
- Use Typescript version "^5.7.3".`);

  if (chainOfThought) {
    sections.push(
      "Begin your response with your thought process, then proceed to generate the necessary files for the Convex backend.",
    );
  }

  sections.push(
    `Now, implement a Convex backend that satisfies the following task description:\n\`\`\`\n${taskDescription}\n\`\`\``,
  );

  return sections.join("\n\n") + "\n";
}

function renderExamples(): string {
  const examplesDir = "examples";
  if (!existsSync(examplesDir)) return "";

  const parts: string[] = ["# Examples:"];

  for (const example of readdirSync(examplesDir)) {
    const examplePath = join(examplesDir, example);
    if (!statSync(examplePath).isDirectory()) continue;

    const taskDescription = readFileSync(join(examplePath, "TASK.txt"), "utf-8");
    const analysis = readFileSync(join(examplePath, "ANALYSIS.txt"), "utf-8");
    const filePaths = collectExampleFiles(examplePath);

    parts.push(`## Example: ${example}\n`);
    parts.push(`### Task\n\`\`\`\n${taskDescription}\n\`\`\`\n`);
    parts.push(`### Analysis\n${analysis}\n`);
    parts.push("### Implementation\n");

    for (const filePath of filePaths) {
      const relPath = relative(examplePath, filePath).replace(/\\/g, "/");
      const content = readFileSync(filePath, "utf-8").trim();
      parts.push(`#### ${relPath}\n\`\`\`typescript\n${content}\n\`\`\`\n`);
    }
  }

  return parts.join("\n");
}

/** Collect relevant source files from an example directory, sorted by depth then name. */
function collectExampleFiles(examplePath: string): string[] {
  const filePaths: string[] = [];
  walkDir(examplePath, (filePath) => {
    if (filePath.includes("node_modules") || filePath.includes("_generated")) {
      return;
    }
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

  return filePaths.sort((a, b) => {
    const depthA = a.split(/[/\\]/).length;
    const depthB = b.split(/[/\\]/).length;
    return depthA !== depthB ? depthA - depthB : a.localeCompare(b);
  });
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
