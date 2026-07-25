import { looksLikeTargetLang } from "../shared/lang";

export interface Segment {
  id: number;
  text: string;
  el: HTMLElement;
}

const CANDIDATE_SELECTOR =
  "p, h1, h2, h3, h4, h5, h6, li, dd, dt, blockquote, figcaption, td, th, summary, caption, [role='heading']";

// div 只在是“文本叶子块”时参与:内部没有任何块级结构,只有行内内容。
// 覆盖 Twitter/X 等不用语义标签、正文全是 div+span 的站点。
const BLOCK_INSIDE =
  "div, ul, ol, dl, table, figure, section, article, header, footer, aside, main, form, fieldset, hr, video, audio, iframe, " +
  "p, h1, h2, h3, h4, h5, h6, li, dd, dt, blockquote, figcaption, td, th, summary, caption";

const SKIP_CLOSEST =
  "pre, code, kbd, samp, nav, form, textarea, select, [contenteditable='true'], svg, .interline-block, .interline-ui";

// div 叶子块额外跳过可交互控件,避免翻译按钮/菜单文案
const DIV_SKIP_CLOSEST =
  "a, button, label, [role='button'], [role='tab'], [role='menuitem'], [role='option']";

const MIN_CHARS = 2;
// div 叶子块的下限:主要靠 DIV_SKIP_CLOSEST 挡 UI 文案,这里只兜底;
// 太高会漏掉短推文("This is mind-blowing" 只有 20 字符)
const MIN_DIV_CHARS = 12;
const MAX_CHARS = 3000; // 段落长度上限,防止单段吃掉大量 token

let nextId = 1;

export function collectSegments(targetLang: string): Segment[] {
  const picked: { el: HTMLElement; text: string }[] = [];
  const pickedSet = new Set<HTMLElement>();
  const candidates = document.querySelectorAll<HTMLElement>(
    `${CANDIDATE_SELECTOR}, div`,
  );

  for (const el of candidates) {
    if (el.dataset.interlineId) continue;
    if (el.closest(SKIP_CLOSEST)) continue;

    const isLeafDiv = el.tagName === "DIV" && !el.matches(CANDIDATE_SELECTOR);
    if (isLeafDiv) {
      if (el.querySelector(BLOCK_INSIDE)) continue;
      if (el.closest(DIV_SKIP_CLOSEST)) continue;
    } else {
      // 只翻译最内层的块(li > p 时翻 p 不翻 li)
      if (el.querySelector(CANDIDATE_SELECTOR)) continue;
    }
    if (el.getClientRects().length === 0) continue;

    const text = el.innerText.replace(/\s+/g, " ").trim();
    if (text.length < (isLeafDiv ? MIN_DIV_CHARS : MIN_CHARS)) continue;
    if (text.length > MAX_CHARS) continue;
    if (!/\p{L}/u.test(text)) continue;
    if (looksLikeTargetLang(text, targetLang)) continue;

    picked.push({ el, text });
    pickedSet.add(el);
  }

  // 候选包含另一候选时丢外层,只留最内层(如 td 里套着叶子 div)
  for (const { el } of picked) {
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (pickedSet.has(p)) pickedSet.delete(p);
    }
  }

  const segments: Segment[] = [];
  for (const { el, text } of picked) {
    if (!pickedSet.has(el)) continue;
    const id = nextId++;
    el.dataset.interlineId = String(id);
    segments.push({ id, text, el });
  }

  return segments;
}
