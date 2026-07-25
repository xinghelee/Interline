import { looksLikeTargetLang } from "../shared/lang";
import { activeKey, getSettings, saveSettings } from "../shared/settings";
import type {
  ContentRequest,
  ContentState,
  TranslateBatchResponse,
  UsageToday,
} from "../shared/types";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const warnEl = $("warn");
const translateBtn = $<HTMLButtonElement>("translate");
const toggleBtn = $<HTMLButtonElement>("toggle");
const toggleOriginalBtn = $<HTMLButtonElement>("toggleOriginal");
const clearBtn = $<HTMLButtonElement>("clear");
const statusEl = $("status");
const usageEl = $("usage");
const progressWrap = $("progressWrap");
const progressBar = $("progressBar");
const siteAutoRow = $("siteAutoRow");
const siteAutoCheck = $<HTMLInputElement>("siteAuto");
const quickInput = $<HTMLTextAreaElement>("quickInput");
const quickGoBtn = $<HTMLButtonElement>("quickGo");
const quickResultWrap = $("quickResultWrap");
const quickResult = $("quickResult");
const quickCopyBtn = $<HTMLButtonElement>("quickCopy");

let tabId: number | undefined;
let pollTimer: number | undefined;

init();

async function init(): Promise<void> {
  $("openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("settingsLink").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  const settings = await getSettings();
  if (!activeKey(settings)) warnEl.classList.remove("hidden");

  // 快捷翻译不依赖 content script,先绑定(chrome:// 等页面也可用)
  quickGoBtn.addEventListener("click", () => void quickTranslate());
  quickInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void quickTranslate();
    }
  });
  quickCopyBtn.addEventListener("click", async () => {
    await navigator.clipboard.writeText(quickResult.textContent ?? "");
    quickCopyBtn.textContent = "已复制";
    setTimeout(() => (quickCopyBtn.textContent = "复制"), 1200);
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;

  const state = await sendToContent({ type: "getState" });
  if (!state) {
    translateBtn.disabled = true;
    statusEl.textContent = "此页面不支持翻译";
    void refreshUsage();
    return;
  }

  // 站点自动翻译开关(hostname 由 content script 报告)
  const host = state.host;
  if (host) {
    siteAutoCheck.checked = settings.autoSites.includes(host);
    siteAutoRow.classList.remove("hidden");
    siteAutoCheck.addEventListener("change", async () => {
      const s = await getSettings();
      const sites = new Set(s.autoSites);
      if (siteAutoCheck.checked) sites.add(host);
      else sites.delete(host);
      await saveSettings({ autoSites: [...sites] });
      if (siteAutoCheck.checked && activeKey(s)) {
        await sendToContent({ type: "translatePage" });
        startPolling();
      }
    });
  }

  translateBtn.addEventListener("click", async () => {
    const s = await getSettings();
    if (!activeKey(s)) {
      warnEl.classList.remove("hidden");
      return;
    }
    await sendToContent({ type: "translatePage" });
    startPolling();
  });
  toggleBtn.addEventListener("click", async () => {
    const next = await sendToContent({ type: "toggleShow" });
    if (next) applyState(next);
  });
  toggleOriginalBtn.addEventListener("click", async () => {
    const next = await sendToContent({ type: "toggleOriginal" });
    if (next) applyState(next);
  });
  clearBtn.addEventListener("click", async () => {
    const next = await sendToContent({ type: "removeAll" });
    if (next) applyState(next);
  });

  applyState(state);
  if (state.state === "translating") startPolling();
  void refreshUsage();
}

function applyState(state: ContentState): void {
  const busy = state.state === "translating";
  translateBtn.disabled = busy;
  translateBtn.textContent = busy
    ? `翻译中… ${state.completed}/${state.total}`
    : state.state === "done"
      ? "重新扫描并翻译"
      : "翻译此页";

  const hasBlocks = state.total > 0 && state.state !== "idle";
  toggleBtn.classList.toggle("hidden", !hasBlocks);
  toggleOriginalBtn.classList.toggle("hidden", !hasBlocks);
  clearBtn.classList.toggle("hidden", !hasBlocks);
  toggleBtn.textContent = state.shown ? "隐藏译文" : "显示译文";
  toggleOriginalBtn.textContent = state.originalShown ? "仅译文" : "显示原文";

  progressWrap.classList.toggle("hidden", !busy);
  progressBar.style.width =
    busy && state.total > 0
      ? `${Math.round((state.completed / state.total) * 100)}%`
      : "0%";

  statusEl.classList.toggle("error", Boolean(state.error));
  statusEl.textContent = state.error
    ? state.error
    : state.state === "done"
      ? `已翻译 ${state.completed} 段`
      : "";
}

function startPolling(): void {
  stopPolling();
  pollTimer = window.setInterval(async () => {
    const state = await sendToContent({ type: "getState" });
    if (!state) return stopPolling();
    applyState(state);
    if (state.state !== "translating") {
      stopPolling();
      void refreshUsage();
    }
  }, 600);
}

function stopPolling(): void {
  if (pollTimer !== undefined) clearInterval(pollTimer);
  pollTimer = undefined;
}

async function quickTranslate(): Promise<void> {
  const text = quickInput.value.trim();
  if (!text) return;

  const settings = await getSettings();
  if (!activeKey(settings)) {
    warnEl.classList.remove("hidden");
    return;
  }
  // 输入已是目标语言时反向翻译成英文(中英互译)
  const targetLang = looksLikeTargetLang(text, settings.targetLang)
    ? "English"
    : undefined;

  quickGoBtn.disabled = true;
  quickResultWrap.classList.remove("hidden");
  quickResult.classList.remove("error");
  quickResult.textContent = "翻译中…";
  try {
    const resp: TranslateBatchResponse = await chrome.runtime.sendMessage({
      type: "translateBatch",
      items: [{ id: 1, text }],
      targetLang,
    });
    if (resp?.ok && resp.translations[1]) {
      quickResult.textContent = resp.translations[1];
    } else {
      quickResult.classList.add("error");
      quickResult.textContent =
        (resp && !resp.ok && resp.error) || "翻译失败,请重试";
    }
  } finally {
    quickGoBtn.disabled = false;
    void refreshUsage();
  }
}

async function sendToContent(msg: ContentRequest): Promise<ContentState | null> {
  if (tabId === undefined) return null;
  try {
    return await chrome.tabs.sendMessage(tabId, msg);
  } catch {
    return null;
  }
}

async function refreshUsage(): Promise<void> {
  try {
    const usage: UsageToday = await chrome.runtime.sendMessage({ type: "getUsage" });
    if (!usage || usage.requests === 0) {
      usageEl.textContent = "今日暂无用量";
      return;
    }
    usageEl.textContent =
      `今日 ${usage.requests} 次 · ` +
      `${fmtK(usage.inputTokens)}↑ ${fmtK(usage.outputTokens)}↓ · ` +
      `≈ $${usage.costUSD.toFixed(3)}`;
  } catch {
    usageEl.textContent = "";
  }
}

function fmtK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
