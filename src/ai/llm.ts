import type { LanguageModel } from "ai";

/**
 * Supported providers and their defaults.
 *
 * Detection order: explicit --model flag > env var auto-detect.
 * Model string format: "provider/model-id" (e.g. "openai/gpt-4o", "anthropic/claude-sonnet-4-20250514")
 *
 * Env vars:
 *   ANTHROPIC_API_KEY   → anthropic/claude-sonnet-4-20250514
 *   OPENAI_API_KEY      → openai/gpt-4o
 *   GOOGLE_GENERATIVE_AI_API_KEY → google/gemini-2.0-flash
 *   DEEPSEEK_API_KEY    → deepseek/deepseek-chat
 *   DASHSCOPE_API_KEY   → qwen/qwen-plus (Alibaba Cloud DashScope)
 */

interface ProviderConfig {
  envVar: string;
  defaultModel: string;
  createModel: (modelId: string) => Promise<LanguageModel>;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  anthropic: {
    envVar: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-4-20250514",
    createModel: async (modelId) => {
      const { anthropic } = await import("@ai-sdk/anthropic");
      return anthropic(modelId);
    },
  },
  openai: {
    envVar: "OPENAI_API_KEY",
    defaultModel: "gpt-4o",
    createModel: async (modelId) => {
      const { openai } = await import("@ai-sdk/openai");
      return openai(modelId);
    },
  },
  google: {
    envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    defaultModel: "gemini-2.0-flash",
    createModel: async (modelId) => {
      const { google } = await import("@ai-sdk/google");
      return google(modelId);
    },
  },
  deepseek: {
    envVar: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-chat",
    createModel: async (modelId) => {
      const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
      const deepseek = createOpenAICompatible({
        name: "deepseek",
        baseURL: "https://api.deepseek.com/v1",
        apiKey: process.env.DEEPSEEK_API_KEY,
      });
      return deepseek.chatModel(modelId);
    },
  },
  qwen: {
    envVar: "DASHSCOPE_API_KEY",
    defaultModel: "qwen-plus",
    createModel: async (modelId) => {
      const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
      const qwen = createOpenAICompatible({
        name: "qwen",
        baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        apiKey: process.env.DASHSCOPE_API_KEY,
      });
      return qwen.chatModel(modelId);
    },
  },
};

/**
 * Resolve which provider/model to use.
 *
 * @param modelFlag - explicit "provider/model" string from CLI (optional)
 * @returns { providerName, modelId, model }
 */
export async function resolveModel(modelFlag?: string): Promise<{
  providerName: string;
  modelId: string;
  model: LanguageModel;
}> {
  // Explicit model flag: "provider/model-id"
  if (modelFlag) {
    const slashIdx = modelFlag.indexOf("/");
    if (slashIdx === -1) {
      throw new Error(
        `Invalid model format: "${modelFlag}". Expected "provider/model-id" (e.g. "openai/gpt-4o")`
      );
    }
    const providerName = modelFlag.slice(0, slashIdx);
    const modelId = modelFlag.slice(slashIdx + 1);
    const config = PROVIDERS[providerName];
    if (!config) {
      throw new Error(
        `Unknown provider: "${providerName}". Supported: ${Object.keys(PROVIDERS).join(", ")}`
      );
    }
    return { providerName, modelId, model: await config.createModel(modelId) };
  }

  // Auto-detect from env vars (first match wins)
  for (const [name, config] of Object.entries(PROVIDERS)) {
    if (process.env[config.envVar]) {
      return {
        providerName: name,
        modelId: config.defaultModel,
        model: await config.createModel(config.defaultModel),
      };
    }
  }

  const envVars = Object.values(PROVIDERS).map((c) => c.envVar).join(", ");
  throw new Error(
    `No AI provider API key found. Set one of: ${envVars}\n` +
    `Or specify a model explicitly with --model provider/model-id`
  );
}
