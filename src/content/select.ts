import { looksLikeTargetLang } from "../shared/lang";
import { getSettings } from "../shared/settings";
import type { TranslateBatchResponse } from "../shared/types";

const MIN_CHARS = 2;
const MAX_CHARS = 2000;

let enabled = true;
let btn: HTMLButtonElement | null = null;
let bubble: HTMLDivElement | null = null;
let toast: HTMLDivElement | null = null;
let toastTimer: number | undefined;
let pendingText = "";
let anchor: DOMRect | null = null;

export function isSelectionEnabled(): boolean {
  return enabled;
}

export function setSelectionEnabled(v: boolean): void {
  enabled = v;
  if (!v) hideAll();
}

export function setupSelectionTranslate(initial: boolean): void {
  enabled = initial;

  document.addEventListener("mouseup", (e) => {
    if (!enabled) return;
    if ((e.target as HTMLElement | null)?.closest?.(".interline-ui")) return;
    // 等选区在 mouseup 后稳定
    setTimeout(maybeShowButton, 0);
  });

  document.addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement | null)?.closest?.(".interline-ui")) return;
    hideAll();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideAll();
  });

  window.addEventListener("scroll", hideAll, { passive: true, capture: true });
}

export function showToast(text: string): void {
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "interline-ui interline-toast";
    document.documentElement.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.remove("interline-hidden");
  if (toastTimer !== undefined) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast?.classList.add("interline-hidden"), 1600);
}

export function showSelectionToast(on: boolean): void {
  showToast(on ? "划词翻译:开" : "划词翻译:关");
}

function maybeShowButton(): void {
  const sel = window.getSelection();
  const text = sel?.toString().replace(/\s+/g, " ").trim() ?? "";
  if (!sel || sel.isCollapsed || text.length < MIN_CHARS || text.length > MAX_CHARS) {
    return;
  }
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;

  pendingText = text;
  anchor = rect;
  hideBubble();

  const b = ensureButton();
  const size = 28;
  const left = clamp(rect.left + rect.width / 2 - size / 2, 8, window.innerWidth - size - 8);
  const top =
    rect.bottom + size + 16 < window.innerHeight ? rect.bottom + 8 : rect.top - size - 8;
  b.style.left = `${left}px`;
  b.style.top = `${top}px`;
  b.classList.remove("interline-hidden");
}

async function translateSelection(): Promise<void> {
  const text = pendingText;
  if (!text || !anchor) return;
  hideButton();

  const el = ensureBubble();
  const width = Math.min(320, window.innerWidth - 16);
  el.style.maxWidth = `${width}px`;
  el.style.left = `${clamp(anchor.left, 8, window.innerWidth - width - 8)}px`;
  el.style.top = `${Math.min(anchor.bottom + 8, window.innerHeight - 60)}px`;
  el.textContent = "翻译中…";
  el.classList.remove("interline-hidden");

  const settings = await getSettings();
  // 选中的已是目标语言时反向翻成英文
  const targetLang = looksLikeTargetLang(text, settings.targetLang)
    ? "English"
    : undefined;

  let resp: TranslateBatchResponse;
  try {
    resp = await chrome.runtime.sendMessage({
      type: "translateBatch",
      items: [{ id: 1, text }],
      targetLang,
    });
  } catch (e) {
    resp = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  el.textContent = resp?.ok
    ? (resp.translations[1] ?? "(空结果)")
    : `翻译失败:${resp && !resp.ok ? resp.error : "未知错误"}`;
}

function ensureButton(): HTMLButtonElement {
  if (!btn) {
    btn = document.createElement("button");
    btn.className = "interline-ui interline-select-btn";
    btn.textContent = "译";
    btn.addEventListener("click", () => void translateSelection());
    document.documentElement.appendChild(btn);
  }
  return btn;
}

function ensureBubble(): HTMLDivElement {
  if (!bubble) {
    bubble = document.createElement("div");
    bubble.className = "interline-ui interline-bubble";
    document.documentElement.appendChild(bubble);
  }
  return bubble;
}

function hideButton(): void {
  btn?.classList.add("interline-hidden");
}

function hideBubble(): void {
  bubble?.classList.add("interline-hidden");
}

function hideAll(): void {
  hideButton();
  hideBubble();
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
