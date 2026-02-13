/**
 * Model definitions and provider configuration.
 * This is the single source of truth for all supported AI models.
 */

export enum ModelProvider {
  ANTHROPIC = "anthropic",
  OPENAI = "openai",
  TOGETHER = "together",
  GOOGLE = "google",
  XAI = "xai",
  MOONSHOT = "moonshot",
  ZAI = "zai",
}

export type CIRunFrequency = "daily" | "weekly" | "monthly" | "never";

export interface ModelTemplate {
  name: string;
  formattedName: string;
  maxConcurrency: number;
  requiresChainOfThought: boolean;
  usesSystemPrompt: boolean;
  provider: ModelProvider;
  overrideProxy?: string;
  supportsTemperature: boolean;
  ciRunFrequency: CIRunFrequency;
  usesResponsesApi: boolean;
}

function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  return val ? parseInt(val, 10) : fallback;
}

export const ALL_MODELS: ModelTemplate[] = [
  // Anthropic models
  {
    name: "claude-3-5-sonnet-latest",
    formattedName: "Claude 3.5 Sonnet",
    maxConcurrency: envInt("ANTHROPIC_CONCURRENCY", 2),
    requiresChainOfThought: true,
    usesSystemPrompt: true,
    provider: ModelProvider.ANTHROPIC,
    supportsTemperature: true,
    ciRunFrequency: "monthly",
    usesResponsesApi: false,
  },
  {
    name: "claude-3-7-sonnet-latest",
    formattedName: "Claude 3.7 Sonnet",
    maxConcurrency: envInt("ANTHROPIC_CONCURRENCY", 2),
    requiresChainOfThought: true,
    usesSystemPrompt: true,
    provider: ModelProvider.ANTHROPIC,
    supportsTemperature: true,
    ciRunFrequency: "monthly",
    usesResponsesApi: false,
  },
  {
    name: "claude-sonnet-4-0",
    formattedName: "Claude 4 Sonnet",
    maxConcurrency: envInt("ANTHROPIC_CONCURRENCY", 2),
    requiresChainOfThought: true,
    usesSystemPrompt: true,
    provider: ModelProvider.ANTHROPIC,
    overrideProxy: "https://api.anthropic.com/v1",
    supportsTemperature: true,
    ciRunFrequency: "monthly",
    usesResponsesApi: false,
  },
  {
    name: "claude-sonnet-4-5",
    formattedName: "Claude 4.5 Sonnet",
    maxConcurrency: envInt("ANTHROPIC_CONCURRENCY", 2),
    requiresChainOfThought: true,
    usesSystemPrompt: true,
    provider: ModelProvider.ANTHROPIC,
    overrideProxy: "https://api.anthropic.com/v1",
    supportsTemperature: true,
    ciRunFrequency: "daily",
    usesResponsesApi: false,
  },
  {
    name: "claude-haiku-4-5",
    formattedName: "Claude 4.5 Haiku",
    maxConcurrency: envInt("ANTHROPIC_CONCURRENCY", 2),
    requiresChainOfThought: true,
    usesSystemPrompt: true,
    provider: ModelProvider.ANTHROPIC,
    overrideProxy: "https://api.anthropic.com/v1",
    supportsTemperature: true,
    ciRunFrequency: "daily",
    usesResponsesApi: false,
  },
  {
    name: "claude-opus-4-5",
    formattedName: "Claude 4.5 Opus",
    maxConcurrency: envInt("ANTHROPIC_CONCURRENCY", 2),
    requiresChainOfThought: true,
    usesSystemPrompt: true,
    provider: ModelProvider.ANTHROPIC,
    overrideProxy: "https://api.anthropic.com/v1",
    supportsTemperature: true,
    ciRunFrequency: "weekly",
    usesResponsesApi: false,
  },
  {
    name: "claude-opus-4-6",
    formattedName: "Claude 4.6 Opus",
    maxConcurrency: envInt("ANTHROPIC_CONCURRENCY", 2),
    requiresChainOfThought: true,
    usesSystemPrompt: true,
    provider: ModelProvider.ANTHROPIC,
    overrideProxy: "https://api.anthropic.com/v1",
    supportsTemperature: true,
    ciRunFrequency: "daily",
    usesResponsesApi: false,
  },
  // OpenAI models
  {
    name: "o4-mini",
    formattedName: "o4-mini",
    maxConcurrency: envInt("OPENAI_CONCURRENCY", 4),
    requiresChainOfThought: false,
    usesSystemPrompt: false,
    provider: ModelProvider.OPENAI,
    supportsTemperature: false,
    ciRunFrequency: "monthly",
    usesResponsesApi: false,
  },
  {
    name: "gpt-4.1",
    formattedName: "GPT-4.1",
    maxConcurrency: envInt("OPENAI_CONCURRENCY", 4),
    requiresChainOfThought: true,
    usesSystemPrompt: true,
    provider: ModelProvider.OPENAI,
    supportsTemperature: true,
    ciRunFrequency: "monthly",
    usesResponsesApi: false,
  },
  {
    name: "gpt-5.1",
    formattedName: "GPT-5.1",
    maxConcurrency: envInt("OPENAI_CONCURRENCY", 4),
    requiresChainOfThought: false,
    usesSystemPrompt: false,
    provider: ModelProvider.OPENAI,
    supportsTemperature: false,
    ciRunFrequency: "weekly",
    usesResponsesApi: false,
  },
  {
    name: "gpt-5.2",
    formattedName: "GPT-5.2",
    maxConcurrency: envInt("OPENAI_CONCURRENCY", 4),
    requiresChainOfThought: false,
    usesSystemPrompt: false,
    provider: ModelProvider.OPENAI,
    supportsTemperature: false,
    ciRunFrequency: "daily",
    usesResponsesApi: false,
  },
  {
    name: "gpt-5.2-codex",
    formattedName: "GPT-5.2 Codex",
    maxConcurrency: envInt("OPENAI_CONCURRENCY", 4),
    requiresChainOfThought: false,
    usesSystemPrompt: false,
    provider: ModelProvider.OPENAI,
    supportsTemperature: false,
    ciRunFrequency: "daily",
    usesResponsesApi: true,
  },
  // NOTE: gpt-5.3-codex was announced Feb 5, 2026 but API access is not yet available
  // Uncomment when API access is enabled:
  // {
  //   name: "gpt-5.3-codex",
  //   formattedName: "GPT-5.3 Codex",
  //   maxConcurrency: envInt("OPENAI_CONCURRENCY", 4),
  //   requiresChainOfThought: false,
  //   usesSystemPrompt: false,
  //   provider: ModelProvider.OPENAI,
  //   supportsTemperature: false,
  //   ciRunFrequency: "daily",
  //   usesResponsesApi: true,
  // },
  {
    name: "gpt-5",
    formattedName: "GPT-5",
    maxConcurrency: envInt("OPENAI_CONCURRENCY", 4),
    requiresChainOfThought: false,
    usesSystemPrompt: false,
    provider: ModelProvider.OPENAI,
    supportsTemperature: false,
    ciRunFrequency: "daily",
    usesResponsesApi: false,
  },
  {
    name: "gpt-5-mini",
    formattedName: "GPT-5 mini",
    maxConcurrency: envInt("OPENAI_CONCURRENCY", 4),
    requiresChainOfThought: false,
    usesSystemPrompt: false,
    provider: ModelProvider.OPENAI,
    supportsTemperature: false,
    ciRunFrequency: "weekly",
    usesResponsesApi: false,
  },
  {
    name: "gpt-5-nano",
    formattedName: "GPT-5 nano",
    maxConcurrency: envInt("OPENAI_CONCURRENCY", 4),
    requiresChainOfThought: false,
    usesSystemPrompt: false,
    provider: ModelProvider.OPENAI,
    supportsTemperature: false,
    ciRunFrequency: "weekly",
    usesResponsesApi: false,
  },
  // Together AI (open source) models
  {
    name: "deepseek-ai/DeepSeek-V3",
    formattedName: "DeepSeek V3",
    maxConcurrency: envInt("TOGETHER_CONCURRENCY", 4),
    requiresChainOfThought: true,
    usesSystemPrompt: true,
    provider: ModelProvider.TOGETHER,
    overrideProxy: "https://api.together.xyz/v1",
    supportsTemperature: true,
    ciRunFrequency: "daily",
    usesResponsesApi: false,
  },
  {
    name: "deepseek-ai/DeepSeek-R1",
    formattedName: "DeepSeek R1",
    maxConcurrency: envInt("TOGETHER_CONCURRENCY", 4),
    requiresChainOfThought: false,
    usesSystemPrompt: false,
    provider: ModelProvider.TOGETHER,
    overrideProxy: "https://api.together.xyz/v1",
    supportsTemperature: false,
    ciRunFrequency: "daily",
    usesResponsesApi: false,
  },
  {
    name: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
    formattedName: "Llama 4 Maverick",
    maxConcurrency: envInt("TOGETHER_CONCURRENCY", 4),
    requiresChainOfThought: false,
    usesSystemPrompt: true,
    provider: ModelProvider.TOGETHER,
    overrideProxy: "https://api.together.xyz/v1",
    supportsTemperature: true,
    ciRunFrequency: "daily",
    usesResponsesApi: false,
  },
  // Z.AI (GLM) models – direct API
  {
    name: "glm-5",
    formattedName: "GLM 5",
    maxConcurrency: envInt("ZAI_CONCURRENCY", 2),
    requiresChainOfThought: false,
    usesSystemPrompt: true,
    provider: ModelProvider.ZAI,
    overrideProxy: "https://api.z.ai/api/paas/v4/",
    supportsTemperature: true,
    ciRunFrequency: "daily",
    usesResponsesApi: false,
  },
  {
    name: "glm-4.7",
    formattedName: "GLM 4.7",
    maxConcurrency: envInt("ZAI_CONCURRENCY", 2),
    requiresChainOfThought: false,
    usesSystemPrompt: true,
    provider: ModelProvider.ZAI,
    overrideProxy: "https://api.z.ai/api/paas/v4/",
    supportsTemperature: true,
    ciRunFrequency: "weekly",
    usesResponsesApi: false,
  },
  // Moonshot AI (Kimi) models
  {
    name: "kimi-k2-0905-preview",
    formattedName: "Kimi K2",
    maxConcurrency: envInt("MOONSHOT_CONCURRENCY", 4),
    requiresChainOfThought: false,
    usesSystemPrompt: true,
    provider: ModelProvider.MOONSHOT,
    overrideProxy: "https://api.moonshot.ai/v1",
    supportsTemperature: true,
    ciRunFrequency: "weekly",
    usesResponsesApi: false,
  },
  {
    name: "kimi-k2.5",
    formattedName: "Kimi K2.5",
    maxConcurrency: envInt("MOONSHOT_CONCURRENCY", 4),
    requiresChainOfThought: false,
    usesSystemPrompt: true,
    provider: ModelProvider.MOONSHOT,
    overrideProxy: "https://api.moonshot.ai/v1",
    supportsTemperature: false,
    ciRunFrequency: "daily",
    usesResponsesApi: false,
  },
  {
    name: "Qwen/Qwen3-235B-A22B-Instruct-2507-tput",
    formattedName: "Qwen3 235B",
    maxConcurrency: envInt("TOGETHER_CONCURRENCY", 4),
    requiresChainOfThought: false,
    usesSystemPrompt: true,
    provider: ModelProvider.TOGETHER,
    overrideProxy: "https://api.together.xyz/v1",
    supportsTemperature: true,
    ciRunFrequency: "daily",
    usesResponsesApi: false,
  },
  // Google models
  {
    name: "gemini-2.5-flash",
    formattedName: "Gemini 2.5 Flash",
    maxConcurrency: envInt("GOOGLE_CONCURRENCY", 8),
    requiresChainOfThought: true,
    usesSystemPrompt: false,
    provider: ModelProvider.GOOGLE,
    supportsTemperature: true,
    ciRunFrequency: "daily",
    usesResponsesApi: false,
  },
  {
    name: "gemini-2.5-pro",
    formattedName: "Gemini 2.5 Pro",
    maxConcurrency: envInt("GOOGLE_CONCURRENCY", 4),
    requiresChainOfThought: false,
    usesSystemPrompt: false,
    provider: ModelProvider.GOOGLE,
    overrideProxy: "https://generativelanguage.googleapis.com/v1beta",
    supportsTemperature: true,
    ciRunFrequency: "weekly",
    usesResponsesApi: false,
  },
  {
    name: "gemini-3-pro-preview",
    formattedName: "Gemini 3 Pro",
    maxConcurrency: envInt("GOOGLE_CONCURRENCY", 4),
    requiresChainOfThought: false,
    usesSystemPrompt: false,
    provider: ModelProvider.GOOGLE,
    overrideProxy: "https://generativelanguage.googleapis.com/v1beta",
    supportsTemperature: true,
    ciRunFrequency: "daily",
    usesResponsesApi: false,
  },
  // xAI models
  {
    name: "grok-4",
    formattedName: "Grok 4",
    maxConcurrency: envInt("XAI_CONCURRENCY", 4),
    requiresChainOfThought: false,
    usesSystemPrompt: false,
    provider: ModelProvider.XAI,
    overrideProxy: "https://api.x.ai/v1",
    supportsTemperature: true,
    ciRunFrequency: "daily",
    usesResponsesApi: false,
  },
  {
    name: "grok-3-mini-beta",
    formattedName: "Grok 3 Mini (Beta)",
    maxConcurrency: envInt("XAI_CONCURRENCY", 4),
    requiresChainOfThought: false,
    usesSystemPrompt: false,
    provider: ModelProvider.XAI,
    overrideProxy: "https://api.x.ai/v1",
    supportsTemperature: true,
    ciRunFrequency: "weekly",
    usesResponsesApi: false,
  },
];

export const MODELS_BY_NAME: Record<string, ModelTemplate> = Object.fromEntries(
  ALL_MODELS.map((m) => [m.name, m]),
);

export const SYSTEM_PROMPT =
  "You are convexbot, a highly advanced software engineer specialized in creating applications using Convex and TypeScript.";

/** Map provider enum to the environment variable key for its API key. */
export function getApiKeyEnvVar(provider: ModelProvider): string {
  const map: Record<ModelProvider, string> = {
    [ModelProvider.ANTHROPIC]: "ANTHROPIC_API_KEY",
    [ModelProvider.OPENAI]: "OPENAI_API_KEY",
    [ModelProvider.TOGETHER]: "TOGETHER_API_KEY",
    [ModelProvider.GOOGLE]: "GOOGLE_API_KEY",
    [ModelProvider.XAI]: "XAI_API_KEY",
    [ModelProvider.MOONSHOT]: "MOONSHOT_API_KEY",
    [ModelProvider.ZAI]: "ZAI_API_KEY",
  };
  return map[provider];
}

/** Get the direct API base URL for a provider (no proxy). */
export function getProviderBaseUrl(provider: ModelProvider): string {
  const map: Record<ModelProvider, string> = {
    [ModelProvider.ANTHROPIC]: "https://api.anthropic.com/v1",
    [ModelProvider.OPENAI]: "https://api.openai.com/v1",
    [ModelProvider.TOGETHER]: "https://api.together.xyz/v1",
    [ModelProvider.GOOGLE]: "https://generativelanguage.googleapis.com/v1beta",
    [ModelProvider.XAI]: "https://api.x.ai/v1",
    [ModelProvider.MOONSHOT]: "https://api.moonshot.ai/v1",
    [ModelProvider.ZAI]: "https://api.z.ai/api/paas/v4/",
  };
  return map[provider];
}
