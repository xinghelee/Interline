import { looksLikeTargetLang } from "../shared/lang";
import { getSettings } from "../shared/settings";
import type { TranslateBatchResponse } from "../shared/types";
import { showToast } from "./select";

const MAX_CHARS = 5000;

let busy = false;

/** 翻译当前聚焦的输入框内容并原地替换(写英文邮件/推文用) */
export async function translateActiveInput(): Promise<void> {
  if (busy) return;

  const el = document.activeElement as HTMLElement | null;
  const raw = readInput(el);
  if (el === null || raw === undefined) {
    showToast("先点进一个输入框,再按快捷键");
    return;
  }
  const text = raw.trim();
  if (!text) {
    showToast("输入框是空的");
    return;
  }
  if (text.length > MAX_CHARS) {
    showToast("文本过长,一次最多 5000 字符");
    return;
  }

  const settings = await getSettings();
  // 输入已是目标语言(如中文)时反向翻成英文
  const targetLang = looksLikeTargetLang(text, settings.targetLang)
    ? "English"
    : undefined;

  busy = true;
  showToast("翻译中…");
  let resp: TranslateBatchResponse;
  try {
    resp = await chrome.runtime.sendMessage({
      type: "translateBatch",
      items: [{ id: 1, text }],
      targetLang,
    });
  } catch (e) {
    resp = { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    busy = false;
  }

  if (!resp?.ok || !resp.translations[1]) {
    showToast(`翻译失败:${resp && !resp.ok ? resp.error : "未知错误"}`);
    return;
  }
  writeInput(el, resp.translations[1]);
  showToast("已替换为译文,Cmd/Ctrl+Z 可撤销");
}

function readInput(el: HTMLElement | null): string | undefined {
  if (!el) return undefined;
  if (el instanceof HTMLTextAreaElement) return el.value;
  if (el instanceof HTMLInputElement && ["text", "search"].includes(el.type)) {
    return el.value;
  }
  if (el.isContentEditable) return el.innerText;
  return undefined;
}

function writeInput(el: HTMLElement, text: string): void {
  el.focus();

  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    el.select();
    // execCommand 保留撤销栈并触发 input 事件(React 受控组件依赖)
    if (!document.execCommand("insertText", false, text)) {
      setNativeValue(el, text);
    }
    return;
  }

  // contenteditable(X 发推框、Gmail 等):全选后插入
  const sel = window.getSelection();
  if (sel) {
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  document.execCommand("insertText", false, text);
}

/** execCommand 失效时的兜底:用原生 setter 绕过 React 的 value 劫持 */
function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
