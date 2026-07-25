import type { EngineRequest, TranslateResult } from "./engine";
import { requestWithRetry } from "./http";
import { OUTPUT_SCHEMA, systemPrompt } from "./prompt";

const MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const COUNT_TOKENS_URL = "https://api.anthropic.com/v1/messages/count_tokens";
const API_VERSION = "2023-06-01";

function headers(apiKey: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": API_VERSION,
    // 扩展请求自带 Origin 头,API 要求显式声明浏览器直连
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

export async function translateClaude(req: EngineRequest): Promise<TranslateResult> {
  const totalChars = req.items.reduce((n, s) => n + s.text.length, 0);
  const maxTokens = Math.min(8192, 512 + Math.ceil(totalChars * 1.5));

  const body = {
    model: req.model,
    max_tokens: maxTokens,
    system: systemPrompt(req.targetLang),
    messages: [
      { role: "user", content: JSON.stringify({ segments: req.items }) },
    ],
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
  };

  const data = await requestWithRetry(MESSAGES_URL, {
    headers: headers(req.apiKey),
    body,
  });

  if (data.stop_reason === "refusal") {
    throw new Error("模型拒绝了本次翻译请求");
  }
  if (data.stop_reason === "max_tokens") {
    throw new Error("译文超出 max_tokens 上限,请减小批量");
  }

  const textBlock = (data.content ?? []).find(
    (b: { type: string }) => b.type === "text",
  );
  if (!textBlock) throw new Error("API 响应中没有文本内容");

  const parsed = JSON.parse(textBlock.text) as {
    translations: { id: number; text: string }[];
  };
  const map: Record<number, string> = {};
  for (const t of parsed.translations) map[t.id] = t.text;

  return { translations: map, usage: data.usage, model: data.model };
}

export async function pingClaude(apiKey: string, model: string): Promise<void> {
  const body = {
    model,
    messages: [{ role: "user", content: "ping" }],
  };
  await requestWithRetry(COUNT_TOKENS_URL, { headers: headers(apiKey), body }, 0);
}
