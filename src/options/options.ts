import {
  DEFAULT_MODELS,
  getSettings,
  saveSettings,
} from "../shared/settings";
import type {
  CacheStats,
  Provider,
  TestConnectionResponse,
} from "../shared/types";

const MODEL_SUGGESTIONS: Record<Provider, string[]> = {
  anthropic: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-4-8"],
  openai: ["gpt-5-mini", "gpt-5.1", "gpt-4o-mini"],
  grok: ["grok-4-fast-non-reasoning", "grok-4"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"],
};

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const providerEl = $<HTMLSelectElement>("provider");
const apiKeyEl = $<HTMLInputElement>("apiKey");
const modelEl = $<HTMLInputElement>("model");
const modelSuggestionsEl = $<HTMLElement>("modelSuggestions");
const targetLangEl = $<HTMLSelectElement>("targetLang");
const styleColorEl = $<HTMLSelectElement>("styleColor");
const underlineEl = $<HTMLInputElement>("underline");
const selectionEnabledEl = $<HTMLInputElement>("selectionEnabled");
const cacheInfoEl = $("cacheInfo");
const testResultEl = $("testResult");
const saveResultEl = $("saveResult");

// 按服务商记忆的 key 和模型,切换时不丢
const apiKeys: Partial<Record<Provider, string>> = {};
const models: Partial<Record<Provider, string>> = {};
let currentProvider: Provider = "anthropic";

init();

async function init(): Promise<void> {
  const settings = await getSettings();
  Object.assign(apiKeys, settings.apiKeys);
  Object.assign(models, settings.models);
  currentProvider = settings.provider;

  providerEl.value = currentProvider;
  targetLangEl.value = settings.targetLang;
  styleColorEl.value = settings.styleColor;
  underlineEl.checked = settings.underline;
  selectionEnabledEl.checked = settings.selectionEnabled;
  loadProviderFields();
  void refreshCacheInfo();

  providerEl.addEventListener("change", () => {
    stashProviderFields();
    currentProvider = providerEl.value as Provider;
    loadProviderFields();
  });

  $("save").addEventListener("click", async () => {
    await save();
    saveResultEl.textContent = "已保存";
    saveResultEl.className = "ok";
    setTimeout(() => (saveResultEl.textContent = ""), 2000);
  });

  $("test").addEventListener("click", async () => {
    await save();
    testResultEl.textContent = "测试中…";
    testResultEl.className = "";
    const resp: TestConnectionResponse = await chrome.runtime.sendMessage({
      type: "testConnection",
    });
    if (resp?.ok) {
      testResultEl.textContent = "连接成功 ✓";
      testResultEl.className = "ok";
    } else {
      testResultEl.textContent = `失败:${resp?.error ?? "未知错误"}`;
      testResultEl.className = "error";
    }
  });

  $("clearCache").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "clearCache" });
    void refreshCacheInfo();
  });
}

function stashProviderFields(): void {
  apiKeys[currentProvider] = apiKeyEl.value.trim();
  models[currentProvider] = modelEl.value.trim();
}

function loadProviderFields(): void {
  apiKeyEl.value = apiKeys[currentProvider] ?? "";
  modelEl.value = models[currentProvider] || DEFAULT_MODELS[currentProvider];
  modelSuggestionsEl.replaceChildren(
    ...MODEL_SUGGESTIONS[currentProvider].map((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      return opt;
    }),
  );
}

async function save(): Promise<void> {
  stashProviderFields();
  await saveSettings({
    provider: currentProvider,
    apiKeys: { ...apiKeys },
    models: { ...models },
    targetLang: targetLangEl.value,
    styleColor: styleColorEl.value,
    underline: underlineEl.checked,
    selectionEnabled: selectionEnabledEl.checked,
  });
}

async function refreshCacheInfo(): Promise<void> {
  try {
    const stats: CacheStats = await chrome.runtime.sendMessage({
      type: "getCacheStats",
    });
    cacheInfoEl.textContent = `已缓存 ${stats?.entries ?? 0} 条译文`;
  } catch {
    cacheInfoEl.textContent = "缓存不可用";
  }
}
