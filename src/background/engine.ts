import type { SegmentItem, Settings, TranslateContext } from "../shared/types";
import { activeKey, activeModel } from "../shared/settings";
import { pingClaude, translateClaude } from "./claude";
import { pingOpenAICompat, translateOpenAICompat } from "./openai";

export interface EngineRequest {
  items: SegmentItem[];
  targetLang: string;
  apiKey: string;
  model: string;
  glossary: string;
  context?: TranslateContext;
  /** provider = custom 时的接口地址 */
  baseUrl?: string;
}

export interface TranslateResult {
  translations: Record<number, string>;
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}

/** user 消息:上下文只用于消歧,放这里保持 system 前缀稳定可缓存 */
export function userPayload(req: EngineRequest): string {
  return JSON.stringify(
    req.context?.title
      ? { context: { title: req.context.title }, segments: req.items }
      : { segments: req.items },
  );
}

function buildRequest(
  items: SegmentItem[],
  settings: Settings,
  targetLangOverride?: string,
  context?: TranslateContext,
): EngineRequest {
  return {
    items,
    targetLang: targetLangOverride ?? settings.targetLang,
    apiKey: activeKey(settings),
    model: activeModel(settings),
    glossary: settings.glossary,
    context,
    baseUrl:
      settings.provider === "custom" ? settings.customBaseUrl : undefined,
  };
}

export function translate(
  items: SegmentItem[],
  settings: Settings,
  targetLangOverride?: string,
  context?: TranslateContext,
): Promise<TranslateResult> {
  const req = buildRequest(items, settings, targetLangOverride, context);
  return settings.provider === "anthropic"
    ? translateClaude(req)
    : translateOpenAICompat(settings.provider, req);
}

export function ping(settings: Settings): Promise<void> {
  return settings.provider === "anthropic"
    ? pingClaude(activeKey(settings), activeModel(settings))
    : pingOpenAICompat(
        settings.provider,
        activeKey(settings),
        settings.provider === "custom" ? settings.customBaseUrl : undefined,
      );
}
