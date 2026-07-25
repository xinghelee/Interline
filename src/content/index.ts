import { getSettings } from "../shared/settings";
import type {
  ContentRequest,
  ContentState,
  SegmentItem,
  Settings,
  TranslateBatchResponse,
} from "../shared/types";
import { collectSegments, type Segment } from "./scan";
import { removeAllTranslations, renderTranslation } from "./render";
import {
  isSelectionEnabled,
  setSelectionEnabled,
  setupSelectionTranslate,
  showSelectionToast,
} from "./select";
import { saveSettings } from "../shared/settings";

const MAX_BATCH_SEGMENTS = 12;
const MAX_BATCH_CHARS = 4000;
const CONCURRENCY = 3;
// 视口上下各预读 1.5 屏,滚到之前译文已就绪
const PRELOAD_MARGIN = "150% 0px 150% 0px";
const RESCAN_DEBOUNCE_MS = 500;
const FLUSH_DEBOUNCE_MS = 200;

const state: ContentState = {
  state: "idle",
  shown: true,
  total: 0,
  completed: 0,
  host: location.hostname,
};

// 清除后自增,丢弃仍在途的旧结果
let generation = 0;
let settings: Settings | null = null;
let io: IntersectionObserver | null = null;
let mo: MutationObserver | null = null;
const byId = new Map<number, Segment>();
const queue: Segment[] = [];
let inFlight = 0;
let flushTimer: number | undefined;
let rescanTimer: number | undefined;

chrome.runtime.onMessage.addListener(
  (msg: ContentRequest, _sender, sendResponse) => {
    switch (msg?.type) {
      case "getState":
        sendResponse(state);
        break;
      case "translatePage":
        void start();
        sendResponse({ ok: true });
        break;
      case "toggleShow":
        state.shown = !state.shown;
        document.documentElement.classList.toggle("interline-hide", !state.shown);
        sendResponse(state);
        break;
      case "removeAll":
        stop();
        sendResponse(state);
        break;
      case "toggleTranslate":
        // 快捷键:未翻译则开始,已翻译则显示/隐藏
        if (state.state === "idle") {
          void start();
        } else {
          state.shown = !state.shown;
          document.documentElement.classList.toggle("interline-hide", !state.shown);
        }
        sendResponse(state);
        break;
      case "toggleSelection": {
        const next = !isSelectionEnabled();
        setSelectionEnabled(next);
        showSelectionToast(next);
        void saveSettings({ selectionEnabled: next });
        sendResponse(state);
        break;
      }
    }
    return false;
  },
);

/** 进入自动模式:扫描现有内容,并持续监听新增节点与视口 */
async function start(): Promise<void> {
  settings = await getSettings();
  state.error = undefined;

  ensureObservers();
  const found = scan();
  if (found === 0 && byId.size === 0) {
    state.error = "没有找到可翻译的段落";
  }
}

function stop(): void {
  generation++;
  mo?.disconnect();
  mo = null;
  io?.disconnect();
  io = null;
  byId.clear();
  queue.length = 0;
  inFlight = 0;
  if (flushTimer !== undefined) clearTimeout(flushTimer);
  if (rescanTimer !== undefined) clearTimeout(rescanTimer);
  flushTimer = undefined;
  rescanTimer = undefined;

  removeAllTranslations();
  state.state = "idle";
  state.shown = true;
  state.total = 0;
  state.completed = 0;
  state.error = undefined;
}

function ensureObservers(): void {
  if (!io) {
    io = new IntersectionObserver(
      (entries) => {
        const ready: Segment[] = [];
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          io?.unobserve(entry.target);
          const id = Number((entry.target as HTMLElement).dataset.interlineId);
          const seg = byId.get(id);
          if (seg) ready.push(seg);
        }
        if (ready.length > 0) enqueue(ready);
      },
      { rootMargin: PRELOAD_MARGIN },
    );
  }

  if (!mo) {
    mo = new MutationObserver((mutations) => {
      if (!mutations.some(hasRelevantAddition)) return;
      if (rescanTimer !== undefined) return;
      rescanTimer = window.setTimeout(() => {
        rescanTimer = undefined;
        scan();
      }, RESCAN_DEBOUNCE_MS);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
}

function hasRelevantAddition(m: MutationRecord): boolean {
  for (const node of m.addedNodes) {
    if (node instanceof HTMLElement) {
      if (
        !node.classList.contains("interline-block") &&
        !node.classList.contains("interline-ui")
      ) {
        return true;
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      return true;
    }
  }
  return false;
}

/** 扫描未翻译段落,交给 IntersectionObserver 等待进入视口 */
function scan(): number {
  if (!settings || !io) return 0;
  const segments = collectSegments(settings.targetLang);
  for (const seg of segments) {
    byId.set(seg.id, seg);
    io.observe(seg.el);
  }
  return segments.length;
}

function enqueue(segments: Segment[]): void {
  queue.push(...segments);
  state.total += segments.length;
  state.state = "translating";
  if (flushTimer === undefined) {
    flushTimer = window.setTimeout(() => {
      flushTimer = undefined;
      flush();
    }, FLUSH_DEBOUNCE_MS);
  }
}

function flush(): void {
  while (queue.length > 0 && inFlight < CONCURRENCY) {
    const batch = takeBatch();
    if (batch.length === 0) break;

    const gen = generation;
    inFlight++;
    state.state = "translating";
    void runBatch(batch, gen).finally(() => {
      if (gen !== generation) return;
      inFlight--;
      if (queue.length > 0) flush();
      else if (inFlight === 0) {
        state.state = state.completed > 0 ? "done" : "idle";
      }
    });
  }
}

function takeBatch(): Segment[] {
  const batch: Segment[] = [];
  let chars = 0;
  while (queue.length > 0 && batch.length < MAX_BATCH_SEGMENTS) {
    const next = queue[0];
    // 虚拟列表可能已把节点销毁,直接丢弃不计费
    if (!next.el.isConnected) {
      queue.shift();
      byId.delete(next.id);
      state.total -= 1;
      continue;
    }
    if (batch.length > 0 && chars + next.text.length > MAX_BATCH_CHARS) break;
    queue.shift();
    batch.push(next);
    chars += next.text.length;
  }
  return batch;
}

async function runBatch(batch: Segment[], gen: number): Promise<void> {
  const items: SegmentItem[] = batch.map(({ id, text }) => ({ id, text }));
  let resp: TranslateBatchResponse;
  try {
    resp = await chrome.runtime.sendMessage({ type: "translateBatch", items });
  } catch (e) {
    resp = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (gen !== generation) return;

  if (!resp?.ok) {
    state.error = resp?.error ?? "翻译请求失败";
    state.completed += batch.length;
    return;
  }
  for (const seg of batch) {
    const text = resp.translations[seg.id];
    if (text && settings) renderTranslation(seg.el, text, settings);
    state.completed += 1;
  }
}

// 初始化:划词翻译 + 站点自动翻译
void (async () => {
  const s = await getSettings();
  setupSelectionTranslate(s.selectionEnabled);
  if (s.autoSites.includes(location.hostname)) void start();
})();
