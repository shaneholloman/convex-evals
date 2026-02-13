/**
 * LLM code generation: builds prompts, calls provider APIs, parses responses.
 *
 * Uses the Vercel AI SDK (generateText) as a unified interface across all
 * providers. When the "web_search" experiment is active, a Tavily-powered
 * search tool is made available to every model.
 */
import { generateText, type LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { createTogetherAI } from "@ai-sdk/togetherai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import MarkdownIt from "markdown-it";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, relative } from "path";
import {
  type ModelTemplate,
  ModelProvider,
  SYSTEM_PROMPT,
} from "./index.js";
import {
  CONVEX_GUIDELINES,
  renderCompactGuidelines,
  renderGuidelines,
} from "./guidelines.js";
import {
  webSearchTool,
  WEB_SEARCH_SYSTEM_SUPPLEMENT,
  MAX_TOOL_STEPS,
} from "./webSearch.js";
import { logInfo } from "../logging.js";
import { stepCountIs } from "ai";

// ── Experiment helpers ────────────────────────────────────────────────

function isWebSearchEnabled(): boolean {
  const exp = process.env.EVALS_EXPERIMENT;
  return exp === "web_search" || exp === "web_search_no_guidelines";
}

// ── Guidelines helpers ────────────────────────────────────────────────

function getGuidelinesContent(): string {
  const customPath = process.env.CUSTOM_GUIDELINES_PATH;
  if (customPath && existsSync(customPath)) {
    return readFileSync(customPath, "utf-8");
  }
  const exp = process.env.EVALS_EXPERIMENT;
  if (exp === "no_guidelines" || exp === "web_search_no_guidelines") return "";
  if (exp === "agents_md") return renderCompactGuidelines();
  return renderGuidelines(CONVEX_GUIDELINES);
}

// ── AI SDK model construction ────────────────────────────────────────

/**
 * Create an AI SDK LanguageModel from our ModelTemplate + API key.
 * Each provider gets its own SDK constructor; Moonshot uses the
 * OpenAI-compatible adapter.
 */
function createLanguageModel(
  template: ModelTemplate,
  apiKey: string,
): LanguageModel {
  switch (template.provider) {
    case ModelProvider.OPENAI: {
      const openai = createOpenAI({ apiKey });
      if (template.usesResponsesApi) {
        return openai.responses(template.name);
      }
      return openai(template.name);
    }

    case ModelProvider.ANTHROPIC: {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(template.name);
    }

    case ModelProvider.GOOGLE: {
      const google = createGoogleGenerativeAI({
        apiKey,
        ...(template.overrideProxy
          ? { baseURL: template.overrideProxy }
          : {}),
      });
      return google(template.name);
    }

    case ModelProvider.XAI: {
      const xai = createXai({ apiKey });
      return xai(template.name);
    }

    case ModelProvider.TOGETHER: {
      const together = createTogetherAI({ apiKey });
      return together(template.name);
    }

    case ModelProvider.MOONSHOT: {
      const moonshot = createOpenAICompatible({
        name: "moonshot",
        baseURL: template.overrideProxy ?? "https://api.moonshot.ai/v1",
        apiKey,
      });
      return moonshot.chatModel(template.name);
    }

    case ModelProvider.OPENROUTER: {
      const openrouter = createOpenAICompatible({
        name: "openrouter",
        baseURL:
          template.overrideProxy ?? "https://openrouter.ai/api/v1",
        apiKey,
      });
      return openrouter.chatModel(template.name);
    }

    default: {
      const _exhaustive: never = template.provider;
      throw new Error(`Unsupported provider: ${_exhaustive}`);
    }
  }
}

// ── Token limit helpers ──────────────────────────────────────────────

function getMaxOutputTokens(template: ModelTemplate): number {
  if (template.provider === ModelProvider.TOGETHER) return 4096;
  if (template.name === "claude-3-5-sonnet-latest") return 8192;
  return 16384;
}

// ── Model class ───────────────────────────────────────────────────────

export class Model {
  private languageModel: LanguageModel;
  private template: ModelTemplate;

  constructor(apiKey: string, model: ModelTemplate) {
    this.template = model;
    this.languageModel = createLanguageModel(model, apiKey);
  }

  async generate(prompt: string): Promise<Record<string, string>> {
    const userPrompt = renderPrompt(this.template.requiresChainOfThought, prompt);
    const useWebSearch = isWebSearchEnabled();

    const systemContent = useWebSearch
      ? `${SYSTEM_PROMPT}\n\n${WEB_SEARCH_SYSTEM_SUPPLEMENT}`
      : SYSTEM_PROMPT;

    const maxTokens = getMaxOutputTokens(this.template);

    // Build the base options shared across both prompt styles
    const baseOptions = {
      model: this.languageModel,
      maxOutputTokens: maxTokens,
      maxRetries: 5,
      ...(this.template.supportsTemperature
        ? {
            temperature: parseFloat(
              process.env.EVAL_TEMPERATURE ?? "0.7",
            ),
          }
        : {}),
    };

    // For models that support a system prompt, use `system` + `prompt`.
    // For models that don't, prepend system content as the first user
    // message via the `messages` API instead.
    const promptOptions = this.template.usesSystemPrompt
      ? {
          system: systemContent,
          prompt: userPrompt,
        }
      : {
          messages: [
            { role: "user" as const, content: systemContent },
            { role: "user" as const, content: userPrompt },
          ],
        };

    const options: Parameters<typeof generateText>[0] = {
      ...baseOptions,
      ...promptOptions,
    };

    // When the web search experiment is active, provide the tool and
    // allow multiple steps so the model can search then generate.
    if (useWebSearch) {
      options.tools = { web_search: webSearchTool };
      options.stopWhen = stepCountIs(MAX_TOOL_STEPS);
      options.onStepFinish = ({ toolCalls }) => {
        if (toolCalls && toolCalls.length > 0) {
          logInfo(
            `  [web_search] Model made ${toolCalls.length} tool call(s)`,
          );
        }
      };
    }

    const result = await generateText(options);
    return parseMarkdownResponse(result.text);
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
