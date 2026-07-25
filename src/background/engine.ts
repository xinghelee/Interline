import type { SegmentItem, Settings } from "../shared/types";
import { activeKey, activeModel } from "../shared/settings";
import { pingClaude, translateClaude } from "./claude";
import { pingOpenAICompat, translateOpenAICompat } from "./openai";

export interface EngineRequest {
  items: SegmentItem[];
  targetLang: string;
  apiKey: string;
  model: string;
}

export interface TranslateResult {
  translations: Record<number, string>;
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}

export function translate(
  items: SegmentItem[],
  settings: Settings,
  targetLangOverride?: string,
): Promise<TranslateResult> {
  const req: EngineRequest = {
    items,
    targetLang: targetLangOverride ?? settings.targetLang,
    apiKey: activeKey(settings),
    model: activeModel(settings),
  };
  return settings.provider === "anthropic"
    ? translateClaude(req)
    : translateOpenAICompat(settings.provider, req);
}

export function ping(settings: Settings): Promise<void> {
  return settings.provider === "anthropic"
    ? pingClaude(activeKey(settings), activeModel(settings))
    : pingOpenAICompat(settings.provider, activeKey(settings));
}
