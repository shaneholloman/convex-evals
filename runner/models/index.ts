/**
 * Model definitions and provider configuration.
 * This is the single source of truth for all supported AI models.
 */

export type CIRunFrequency = "daily" | "weekly" | "monthly" | "never";

export const OPENROUTER_API_KEY_VAR = "OPENROUTER_API_KEY";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_MAX_CONCURRENCY = parseInt(
  process.env.OPENROUTER_CONCURRENCY ?? "8",
  10,
);

export interface ModelTemplate {
  name: string;
  formattedName?: string;
  overrideProxy?: string;
  ciRunFrequency: CIRunFrequency;
  apiKind?: "chat" | "responses";
}

export const ALL_MODELS: ModelTemplate[] = [
  // Anthropic models (via OpenRouter)
  {
    name: "anthropic/claude-3.5-sonnet",
    ciRunFrequency: "monthly",
  },
  {
    name: "anthropic/claude-3.7-sonnet",
    ciRunFrequency: "monthly",
  },
  {
    name: "anthropic/claude-sonnet-4",
    ciRunFrequency: "monthly",
  },
  {
    name: "anthropic/claude-sonnet-4.5",
    ciRunFrequency: "weekly",
  },
  {
    name: "anthropic/claude-sonnet-4.6",
    ciRunFrequency: "daily",
  },
  {
    name: "anthropic/claude-haiku-4.5",
    ciRunFrequency: "daily",
  },
  {
    name: "anthropic/claude-opus-4.5",
    ciRunFrequency: "weekly",
  },
  {
    name: "anthropic/claude-opus-4.6",
    ciRunFrequency: "daily",
  },
  // OpenAI models (non-codex via OpenRouter)
  {
    name: "openai/o4-mini",
    ciRunFrequency: "monthly",
  },
  {
    name: "openai/gpt-4.1",
    ciRunFrequency: "monthly",
  },
  {
    name: "openai/gpt-5.1",
    ciRunFrequency: "monthly",
  },
  {
    name: "openai/gpt-5.2",
    ciRunFrequency: "weekly",
  },
  {
    name: "openai/gpt-5.4",
    ciRunFrequency: "daily",
  },
  {
    name: "openai/gpt-5.3-codex",
    ciRunFrequency: "daily",
    apiKind: "responses",
  },
  {
    name: "openai/gpt-5.2-codex",
    ciRunFrequency: "weekly",
    apiKind: "responses",
  },
  {
    name: "openai/gpt-5",
    ciRunFrequency: "weekly",
  },
  {
    name: "openai/gpt-5-mini",
    ciRunFrequency: "weekly",
  },
  {
    name: "openai/gpt-5-nano",
    ciRunFrequency: "weekly",
  },
  // DeepSeek / Together models (via OpenRouter)
  {
    name: "deepseek/deepseek-chat-v3",
    ciRunFrequency: "daily",
  },
  {
    name: "deepseek/deepseek-r1",
    ciRunFrequency: "daily",
  },
  {
    name: "meta-llama/llama-4-maverick",
    ciRunFrequency: "weekly",
  },
  {
    name: "qwen/qwen3-235b-a22b",
    ciRunFrequency: "daily",
  },
  {
    name: "qwen/qwen3.5-plus-02-15",
    ciRunFrequency: "daily",
  },
  {
    name: "qwen/qwen3.5-397b-a17b",
    ciRunFrequency: "daily",
  },
  // Z.AI (GLM) models – via OpenRouter
  {
    name: "z-ai/glm-5",
    ciRunFrequency: "daily",
  },
  {
    name: "z-ai/glm-4.7",
    ciRunFrequency: "weekly",
  },
  // Moonshot AI (Kimi) models – via OpenRouter
  {
    name: "moonshotai/kimi-k2-0905",
    ciRunFrequency: "weekly",
  },
  {
    name: "moonshotai/kimi-k2.5",
    ciRunFrequency: "daily",
  },
  // Google models – via OpenRouter
  {
    name: "google/gemini-2.5-flash",
    ciRunFrequency: "weekly",
  },
  {
    name: "google/gemini-3-flash-preview",
    ciRunFrequency: "daily",
  },
  {
    name: "google/gemini-3.1-flash-lite-preview",
    ciRunFrequency: "daily",
  },
  {
    name: "google/gemini-2.5-pro",
    ciRunFrequency: "monthly",
  },
  {
    name: "google/gemini-3-pro-preview",
    ciRunFrequency: "weekly",
  },
  {
    name: "google/gemini-3.1-pro-preview",
    ciRunFrequency: "daily",
  },
  // MiniMax models – via OpenRouter
  {
    name: "minimax/minimax-m2.5",
    ciRunFrequency: "daily",
  },
  // xAI models – via OpenRouter
  {
    name: "x-ai/grok-4",
    ciRunFrequency: "daily",
  },
  {
    name: "x-ai/grok-3-mini-beta",
    ciRunFrequency: "weekly",
  },
];

export const MODELS_BY_NAME: Record<string, ModelTemplate> = Object.fromEntries(
  ALL_MODELS.map((m) => [m.name, m]),
);

export const SYSTEM_PROMPT =
  "You are convexbot, a highly advanced software engineer specialized in creating applications using Convex and TypeScript.";

