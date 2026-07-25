import type { Provider } from "../shared/types";
import type { EngineRequest, TranslateResult } from "./engine";
import { requestWithRetry } from "./http";
import { OUTPUT_SCHEMA, systemPrompt } from "./prompt";

type CompatProvider = Exclude<Provider, "anthropic">;

const BASES: Record<CompatProvider, string> = {
  openai: "https://api.openai.com/v1",
  grok: "https://api.x.ai/v1",
  deepseek: "https://api.deepseek.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
};

export async function translateOpenAICompat(
  provider: CompatProvider,
  req: EngineRequest,
): Promise<TranslateResult> {
  const body = {
    model: req.model,
    messages: [
      { role: "system", content: systemPrompt(req.targetLang) },
      { role: "user", content: JSON.stringify({ segments: req.items }) },
    ],
    // DeepSeek 不支持 json_schema,靠 json_object + 提示词里的形状约束
    response_format:
      provider === "deepseek"
        ? { type: "json_object" }
        : {
            type: "json_schema",
            json_schema: { name: "translations", strict: true, schema: OUTPUT_SCHEMA },
          },
  };

  const data = await requestWithRetry(`${BASES[provider]}/chat/completions`, {
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${req.apiKey}`,
    },
    body,
  });

  const choice = data.choices?.[0];
  if (!choice?.message) throw new Error("API 响应中没有内容");
  if (choice.message.refusal) throw new Error("模型拒绝了本次翻译请求");
  if (choice.finish_reason === "length") {
    throw new Error("译文超出长度上限,请减小批量");
  }

  const parsed = parseTranslations(choice.message.content ?? "");
  const map: Record<number, string> = {};
  for (const t of parsed.translations ?? []) map[t.id] = t.text;

  return {
    translations: map,
    usage: {
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
    },
    model: data.model ?? req.model,
  };
}

/** 免费的连通性检查:GET /models */
export async function pingOpenAICompat(
  provider: CompatProvider,
  apiKey: string,
): Promise<void> {
  await requestWithRetry(
    `${BASES[provider]}/models`,
    { method: "GET", headers: { authorization: `Bearer ${apiKey}` } },
    0,
  );
}

/** 尽量捞出 JSON 主体:剥 ``` 围栏、取花括号段、转义字符串内的裸换行
    (json_object 模式下模型常把译文换行原样放进字符串,产生非法 JSON) */
function parseTranslations(text: string): {
  translations?: { id: number; text: string }[];
} {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1].trim());
  const braces = trimmed.match(/\{[\s\S]*\}/);
  if (braces) candidates.push(braces[0]);
  for (const c of [...candidates]) candidates.push(escapeRawControlChars(c));

  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* 试下一个 */
    }
  }
  throw new Error(`无法解析模型返回的 JSON:${trimmed.slice(0, 100)}`);
}

function escapeRawControlChars(json: string): string {
  let out = "";
  let inStr = false;
  let escaped = false;
  for (const ch of json) {
    if (!inStr) {
      if (ch === '"') inStr = true;
      out += ch;
      continue;
    }
    if (escaped) {
      out += ch;
      escaped = false;
    } else if (ch === "\\") {
      out += ch;
      escaped = true;
    } else if (ch === '"') {
      inStr = false;
      out += ch;
    } else if (ch === "\n") {
      out += "\\n";
    } else if (ch === "\r") {
      out += "\\r";
    } else if (ch === "\t") {
      out += "\\t";
    } else {
      out += ch;
    }
  }
  return out;
}
