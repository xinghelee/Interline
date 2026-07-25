import type { Settings } from "../shared/types";

function createBlock(el: HTMLElement, settings: Settings): HTMLDivElement {
  const node = document.createElement("div");
  node.className = "interline-block";
  node.dataset.interlineFor = el.dataset.interlineId ?? "";
  if (settings.styleColor) {
    node.style.color = settings.styleColor;
    node.style.opacity = "1";
  }
  if (settings.underline) node.classList.add("interline-underline");
  // 记录原文字号并内联锁定(!important):仅译文模式把原文 font-size 压 0,译文不受连累
  const cs = getComputedStyle(el);
  node.style.setProperty("font-size", cs.fontSize, "important");
  node.style.setProperty("line-height", cs.lineHeight, "important");
  // X 等站点只给最内层 span 设字体,容器落在浏览器默认衬线体上,兜底成系统字体
  if (/^(-webkit-standard|Times)/i.test(cs.fontFamily)) {
    node.style.fontFamily = 'system-ui, -apple-system, "PingFang SC", sans-serif';
  }
  return node;
}

/** 段落入队后先放一个脉动占位块,译文回来原地替换 */
export function renderPending(el: HTMLElement, settings: Settings): void {
  if (el.querySelector(":scope > .interline-block")) return;
  const node = createBlock(el, settings);
  node.classList.add("interline-pending");
  node.textContent = "⋯";
  el.appendChild(node);
}

export function removePending(el: HTMLElement): void {
  el.querySelector(":scope > .interline-block.interline-pending")?.remove();
}

export function renderTranslation(
  el: HTMLElement,
  text: string,
  settings: Settings,
): void {
  const existing = el.querySelector<HTMLElement>(":scope > .interline-block");
  if (existing?.classList.contains("interline-pending")) {
    existing.classList.remove("interline-pending");
    existing.textContent = text;
    return;
  }
  if (existing) return;

  const node = createBlock(el, settings);
  node.textContent = text;
  el.appendChild(node);
}

export function removeAllTranslations(): void {
  document.querySelectorAll(".interline-block").forEach((n) => n.remove());
  document
    .querySelectorAll<HTMLElement>("[data-interline-id]")
    .forEach((el) => delete el.dataset.interlineId);
  document.documentElement.classList.remove("interline-hide");
}
