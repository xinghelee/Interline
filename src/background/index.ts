import { activeKey, activeModel, getSettings } from "../shared/settings";
import type {
  BackgroundRequest,
  CacheStats,
  TestConnectionResponse,
  TranslateBatchResponse,
  TranslateContext,
} from "../shared/types";
import {
  cacheClear,
  cacheCount,
  cacheGetMany,
  cacheKey,
  cachePutMany,
} from "./cache";
import { ping, translate } from "./engine";
import { getUsage, recordUsage } from "./usage";

chrome.runtime.onMessage.addListener(
  (msg: BackgroundRequest | undefined, _sender, sendResponse) => {
    switch (msg?.type) {
      case "translateBatch":
        handleTranslateBatch(msg.items, msg.targetLang, msg.context)
          .then(sendResponse)
          .catch((e) =>
            sendResponse({ ok: false, error: errorMessage(e) } satisfies TranslateBatchResponse),
          );
        return true;
      case "getUsage":
        getUsage().then(sendResponse);
        return true;
      case "testConnection":
        handleTestConnection()
          .then(sendResponse)
          .catch((e) =>
            sendResponse({ ok: false, error: errorMessage(e) } satisfies TestConnectionResponse),
          );
        return true;
      case "getCacheStats":
        cacheCount()
          .then((entries) => sendResponse({ entries } satisfies CacheStats))
          .catch(() => sendResponse({ entries: 0 } satisfies CacheStats));
        return true;
      case "clearCache":
        cacheClear()
          .then(() => sendResponse({ ok: true }))
          .catch((e) => sendResponse({ ok: false, error: errorMessage(e) }));
        return true;
    }
    return false;
  },
);

// 广告屏蔽:按设置启停内置规则表
async function applyAdBlock(): Promise<void> {
  const settings = await getSettings();
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets(
      settings.adBlock
        ? { enableRulesetIds: ["ads"] }
        : { disableRulesetIds: ["ads"] },
    );
  } catch {
    // 规则表不可用时忽略
  }
}
void applyAdBlock();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes["interline:settings"]) void applyAdBlock();
});

// 快捷键:转发给当前标签页的 content script
chrome.commands.onCommand.addListener(async (command) => {
  const type =
    command === "toggle-translate"
      ? ("toggleTranslate" as const)
      : command === "toggle-selection"
        ? ("toggleSelection" as const)
        : command === "translate-input"
          ? ("translateInput" as const)
          : null;
  if (!type) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type });
  } catch {
    // 页面没有 content script(chrome:// 等),忽略
  }
});

async function handleTranslateBatch(
  items: { id: number; text: string }[],
  targetLangOverride?: string,
  context?: TranslateContext,
): Promise<TranslateBatchResponse> {
  const settings = await getSettings();
  // 自定义端点(本地模型)可以没有 key
  if (!activeKey(settings) && settings.provider !== "custom") {
    return { ok: false, error: "尚未设置 API Key" };
  }
  if (settings.provider === "custom" && !settings.customBaseUrl) {
    return { ok: false, error: "请先在设置中填写自定义接口地址" };
  }

  const target = targetLangOverride ?? settings.targetLang;
  // 术语表影响译文,纳入缓存 key;页面标题只是消歧线索,刻意不纳入
  const cacheScope = `${settings.provider}/${activeModel(settings)}#${settings.glossary}`;

  const translations: Record<number, string> = {};
  const keyById = new Map<number, string>();
  let misses = items;
  try {
    for (const it of items) {
      keyById.set(it.id, await cacheKey(it.text, target, cacheScope));
    }
    const hits = await cacheGetMany([...keyById.values()]);
    misses = [];
    for (const it of items) {
      const hit = hits.get(keyById.get(it.id)!);
      if (hit !== undefined) translations[it.id] = hit;
      else misses.push(it);
    }
  } catch {
    misses = items; // 缓存不可用时全量走 API
  }

  if (misses.length > 0) {
    const result = await translate(misses, settings, targetLangOverride, context);
    await recordUsage(
      result.model,
      result.usage.input_tokens,
      result.usage.output_tokens,
    );

    const fresh: { key: string; text: string }[] = [];
    for (const it of misses) {
      const text = result.translations[it.id];
      if (text === undefined) continue;
      translations[it.id] = text;
      const key = keyById.get(it.id);
      if (key) fresh.push({ key, text });
    }
    if (fresh.length > 0) await cachePutMany(fresh).catch(() => {});
  }

  return { ok: true, translations };
}

async function handleTestConnection(): Promise<TestConnectionResponse> {
  const settings = await getSettings();
  if (!activeKey(settings) && settings.provider !== "custom") {
    return { ok: false, error: "尚未设置 API Key" };
  }
  await ping(settings);
  return { ok: true };
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
