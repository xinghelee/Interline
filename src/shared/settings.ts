import type { Provider, Settings } from "./types";

export const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-5-mini",
  grok: "grok-4-fast-non-reasoning",
  deepseek: "deepseek-chat",
  gemini: "gemini-2.5-flash",
};

export const DEFAULT_SETTINGS: Settings = {
  provider: "anthropic",
  apiKeys: {},
  models: {},
  targetLang: "简体中文",
  styleColor: "",
  underline: false,
  autoSites: [],
  selectionEnabled: true,
  showOriginal: true,
  adBlock: true,
};

export function activeKey(s: Settings): string {
  return s.apiKeys[s.provider] ?? "";
}

export function activeModel(s: Settings): string {
  return s.models[s.provider] || DEFAULT_MODELS[s.provider];
}

const KEY = "interline:settings";

export async function getSettings(): Promise<Settings> {
  const stored = ((await chrome.storage.local.get(KEY))[KEY] ?? {}) as
    Partial<Settings> & { apiKey?: string; model?: string };

  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...stored,
    apiKeys: { ...stored.apiKeys },
    models: { ...stored.models },
  };
  // v0.1 只有 Claude 单 key/model 字段,迁移进 map
  if (stored.apiKey && !settings.apiKeys.anthropic) {
    settings.apiKeys.anthropic = stored.apiKey;
  }
  if (stored.model && !settings.models.anthropic) {
    settings.models.anthropic = stored.model;
  }
  return settings;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}
