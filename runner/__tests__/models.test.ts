import { describe, it, expect } from "bun:test";
import {
  ModelProvider,
  ALL_MODELS,
  MODELS_BY_NAME,
  SYSTEM_PROMPT,
  getApiKeyEnvVar,
  getProviderBaseUrl,
  type ModelTemplate,
  type CIRunFrequency,
} from "../models/index.js";

describe("ModelProvider enum", () => {
  it("has all expected providers", () => {
    expect(ModelProvider.OPENROUTER).toBe("openrouter" as ModelProvider);
  });
});

describe("ALL_MODELS", () => {
  it("contains at least one model", () => {
    expect(ALL_MODELS.length).toBeGreaterThan(0);
  });

  it("every model has required fields", () => {
    for (const model of ALL_MODELS) {
      expect(model.name).toBeTruthy();
      expect(model.formattedName).toBeTruthy();
      expect(model.maxConcurrency).toBeGreaterThan(0);
      expect(typeof model.requiresChainOfThought).toBe("boolean");
      expect(typeof model.usesSystemPrompt).toBe("boolean");
      expect(typeof model.supportsTemperature).toBe("boolean");
      expect(typeof model.usesResponsesApi).toBe("boolean");
      expect(Object.values(ModelProvider)).toContain(model.provider);
    }
  });

  it("every model has a valid ciRunFrequency", () => {
    const validFrequencies: CIRunFrequency[] = [
      "daily",
      "weekly",
      "monthly",
      "never",
    ];
    for (const model of ALL_MODELS) {
      expect(validFrequencies).toContain(model.ciRunFrequency);
    }
  });

  it("has no duplicate model names", () => {
    const names = ALL_MODELS.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("contains known models", () => {
    const names = ALL_MODELS.map((m) => m.name);
    expect(names).toContain("openai/gpt-5.2-codex");
    expect(names).toContain("openai/gpt-5");
    expect(names).toContain("anthropic/claude-opus-4.6");
    expect(names).toContain("google/gemini-2.5-flash");
  });

  it("has at least one model per provider", () => {
    const providers = new Set(ALL_MODELS.map((m) => m.provider));
    for (const p of Object.values(ModelProvider)) {
      expect(providers.has(p)).toBe(true);
    }
  });
});

describe("MODELS_BY_NAME", () => {
  it("has the same number of entries as ALL_MODELS", () => {
    expect(Object.keys(MODELS_BY_NAME).length).toBe(ALL_MODELS.length);
  });

  it("looks up a model by name", () => {
    const model = MODELS_BY_NAME["openai/gpt-5"];
    expect(model).toBeDefined();
    expect(model.formattedName).toBe("GPT-5");
    expect(model.provider).toBe(ModelProvider.OPENROUTER);
  });

  it("returns undefined for non-existent model", () => {
    expect(MODELS_BY_NAME["non-existent-model"]).toBeUndefined();
  });
});

describe("SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(SYSTEM_PROMPT).toBeTruthy();
    expect(typeof SYSTEM_PROMPT).toBe("string");
  });

  it("mentions Convex", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("convex");
  });
});

describe("getApiKeyEnvVar", () => {
  it("returns correct env var for each provider", () => {
    expect(getApiKeyEnvVar(ModelProvider.OPENROUTER)).toBe(
      "OPENROUTER_API_KEY",
    );
  });
});

describe("getProviderBaseUrl", () => {
  it("returns correct URLs", () => {
    expect(getProviderBaseUrl(ModelProvider.OPENROUTER)).toBe(
      "https://openrouter.ai/api/v1",
    );
  });

  it("returns URLs that start with https://", () => {
    for (const provider of Object.values(ModelProvider)) {
      expect(getProviderBaseUrl(provider as ModelProvider)).toMatch(
        /^https:\/\//,
      );
    }
  });
});

describe("model overrideProxy values", () => {
  it("overrideProxy when present starts with https://", () => {
    for (const model of ALL_MODELS) {
      if (model.overrideProxy) {
        expect(model.overrideProxy).toMatch(/^https:\/\//);
      }
    }
  });
});
