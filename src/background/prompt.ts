// 结构化输出:强制模型按 {translations:[{id,text}]} 返回,避免解析分隔符
export const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          text: { type: "string" },
        },
        required: ["id", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["translations"],
  additionalProperties: false,
};

// 保持逐字稳定,加 prompt cache 时这段就是可缓存前缀。
// JSON 形状写进提示词,不支持 json_schema 的引擎(DeepSeek)靠它约束输出。
export function systemPrompt(targetLang: string): string {
  return [
    `You are a translation engine. Translate each input segment into ${targetLang}.`,
    "Rules:",
    "- Translate faithfully and naturally; match the register and tone of the source.",
    "- Keep code identifiers, commands, URLs, and proper nouns that are conventionally left untranslated.",
    "- Never add explanations, notes, or extra segments.",
    "- Output exactly one translation per input segment, with the same id.",
    'Output JSON only, exactly this shape: {"translations":[{"id":1,"text":"..."}]}',
  ].join("\n");
}
