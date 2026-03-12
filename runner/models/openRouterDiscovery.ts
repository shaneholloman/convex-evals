import type { ModelTemplate } from "./index.js";

const OPENROUTER_MODEL_SEARCH_URL =
  "https://openrouter.ai/api/frontend/models/find";

interface FrontendEndpointInfo {
  adapter_name?: string;
  provider_slug?: string;
  provider_info?: {
    adapterName?: string;
  };
}

interface FrontendModelInfo {
  slug?: string;
  name?: string;
  endpoint?: FrontendEndpointInfo;
}

interface FrontendModelSearchResponse {
  data?: {
    models?: FrontendModelInfo[];
  };
}

function inferApiKind(
  modelName: string,
  endpoint: FrontendEndpointInfo | undefined,
): ModelTemplate["apiKind"] | undefined {
  const adapterName =
    endpoint?.adapter_name ?? endpoint?.provider_info?.adapterName;
  if (typeof adapterName === "string" && adapterName.includes("Responses")) {
    return "responses";
  }

  // Fallback heuristic for OpenAI codex slugs if adapter metadata is absent.
  if (modelName.startsWith("openai/") && modelName.includes("codex")) {
    return "responses";
  }

  return undefined;
}

export async function discoverOpenRouterModel(
  modelName: string,
): Promise<{
  template: ModelTemplate;
  provider: string;
} | null> {
  const url = `${OPENROUTER_MODEL_SEARCH_URL}?q=${encodeURIComponent(modelName)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "convex-evals-ci/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to discover OpenRouter model "${modelName}": ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as FrontendModelSearchResponse;
  const models = payload.data?.models;
  if (!Array.isArray(models)) {
    throw new Error(
      `Unexpected OpenRouter discovery response for "${modelName}"`,
    );
  }

  const exactMatch = models.find((model) => model.slug === modelName);
  if (!exactMatch) return null;

  const formattedName =
    typeof exactMatch.name === "string" && exactMatch.name.trim().length > 0
      ? exactMatch.name.trim()
      : modelName;

  const provider =
    exactMatch.endpoint?.provider_slug ??
    (modelName.includes("/") ? modelName.split("/")[0] : "openrouter");

  return {
    template: {
      name: modelName,
      formattedName,
      // Dynamic models are runtime-only and not part of scheduled tiers.
      ciRunFrequency: "never",
      apiKind: inferApiKind(modelName, exactMatch.endpoint),
    },
    provider,
  };
}
