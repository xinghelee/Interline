import type { UsageToday } from "../shared/types";

const KEY = "interline:usage";

// $/MTok [input, output];API 可能返回带日期后缀的模型 ID,按前缀匹配
const PRICES: Record<string, [number, number]> = {
  "claude-haiku-4-5": [1, 5],
  "claude-sonnet-5": [3, 15],
  "claude-opus-4-8": [5, 25],
  "gpt-5-mini": [0.25, 2],
  "gpt-5.1": [1.25, 10],
  "gpt-4o-mini": [0.15, 0.6],
  "grok-4-fast": [0.2, 0.5],
  "grok-4": [3, 15],
  "deepseek-chat": [0.27, 1.1],
  "deepseek-reasoner": [0.55, 2.19],
  "gemini-2.5-flash-lite": [0.1, 0.4],
  "gemini-2.5-flash": [0.3, 2.5],
  "gemini-2.5-pro": [1.25, 10],
};

function priceFor(model: string): [number, number] {
  if (PRICES[model]) return PRICES[model];
  // 前缀匹配取最长的(grok-4-fast-non-reasoning 命中 grok-4-fast 而非 grok-4)
  let best: [number, number] | null = null;
  let bestLen = 0;
  for (const [key, price] of Object.entries(PRICES)) {
    if (model.startsWith(key) && key.length > bestLen) {
      best = price;
      bestLen = key.length;
    }
  }
  return best ?? [0, 0]; // 未知模型不估价,只计 token
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY: UsageToday = {
  date: "",
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUSD: 0,
};

export async function getUsage(): Promise<UsageToday> {
  const stored = await chrome.storage.local.get(KEY);
  const usage: UsageToday = stored[KEY] ?? { ...EMPTY, date: today() };
  if (usage.date !== today()) return { ...EMPTY, date: today() };
  return usage;
}

export async function recordUsage(
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  const usage = await getUsage();
  const [inPrice, outPrice] = priceFor(model);
  usage.requests += 1;
  usage.inputTokens += inputTokens;
  usage.outputTokens += outputTokens;
  usage.costUSD +=
    (inputTokens / 1e6) * inPrice + (outputTokens / 1e6) * outPrice;
  await chrome.storage.local.set({ [KEY]: usage });
}
