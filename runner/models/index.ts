/**
 * Model definitions and provider configuration.
 * This is the single source of truth for all supported AI models.
 */

export const OPENROUTER_API_KEY_VAR = "OPENROUTER_API_KEY";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_MAX_CONCURRENCY = parseInt(
  process.env.OPENROUTER_CONCURRENCY ?? "8",
  10,
);

export interface ModelTemplate {
  name: string;
  runnableName?: string;
  formattedName?: string;
  overrideProxy?: string;
  apiKind?: "chat" | "responses";
}

export const ALL_MODELS: ModelTemplate[] = [
  { name: "anthropic/claude-3.5-sonnet" },
  { name: "anthropic/claude-3.7-sonnet" },
  { name: "anthropic/claude-sonnet-4" },
  { name: "anthropic/claude-sonnet-4.5" },
  { name: "anthropic/claude-sonnet-4.6" },
  { name: "anthropic/claude-haiku-4.5" },
  { name: "anthropic/claude-opus-4.5" },
  { name: "anthropic/claude-opus-4.6" },
  { name: "openai/o4-mini" },
  { name: "openai/gpt-4.1" },
  { name: "openai/gpt-5.1" },
  { name: "openai/gpt-5.2" },
  { name: "openai/gpt-5.4" },
  {
    name: "openai/gpt-5.3-codex",
    apiKind: "responses",
  },
  {
    name: "openai/gpt-5.2-codex",
    apiKind: "responses",
  },
  { name: "openai/gpt-5" },
  { name: "openai/gpt-5-mini" },
  { name: "openai/gpt-5-nano" },
  { name: "deepseek/deepseek-chat-v3" },
  { name: "deepseek/deepseek-r1" },
  { name: "meta-llama/llama-4-maverick" },
  { name: "qwen/qwen3-235b-a22b" },
  { name: "qwen/qwen3.5-plus-02-15" },
  { name: "qwen/qwen3.5-397b-a17b" },
  { name: "z-ai/glm-5" },
  { name: "z-ai/glm-4.7" },
  { name: "moonshotai/kimi-k2-0905" },
  { name: "moonshotai/kimi-k2.5" },
  { name: "google/gemini-2.5-flash" },
  { name: "google/gemini-3-flash-preview" },
  { name: "google/gemini-3.1-flash-lite-preview" },
  { name: "google/gemini-2.5-pro" },
  { name: "google/gemini-3-pro-preview" },
  { name: "google/gemini-3.1-pro-preview" },
  { name: "minimax/minimax-m2.5" },
  { name: "x-ai/grok-4" },
  { name: "x-ai/grok-3-mini-beta" },
];

export const MODELS_BY_NAME: Record<string, ModelTemplate> = Object.fromEntries(
  ALL_MODELS.map((m) => [m.name, m]),
);

export const SYSTEM_PROMPT =
  "You are convexbot, a highly advanced software engineer specialized in creating applications using Convex and TypeScript.";
