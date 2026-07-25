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

// 同一(目标语言, 术语表)下逐字稳定 —— 这段是 prompt cache 的可缓存前缀,
// 页面上下文放 user 消息里,不进 system。
// JSON 形状写进提示词,不支持 json_schema 的引擎(DeepSeek/自定义)靠它约束输出。
export function systemPrompt(targetLang: string, glossary = ""): string {
  const lines = [
    `You are a translation engine. Translate each input segment into ${targetLang}.`,
    "Rules:",
    "- Translate faithfully and naturally; match the register and tone of the source.",
    "- Keep code identifiers, commands, URLs, and proper nouns that are conventionally left untranslated.",
    "- Never add explanations, notes, or extra segments.",
    "- Output exactly one translation per input segment, with the same id.",
    '- The user message may include a "context" field (page title etc.); use it only for disambiguation, never translate or echo it.',
  ];

  const terms = glossary
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && l.includes("="));
  if (terms.length > 0) {
    lines.push("Glossary — always use these exact translations:");
    for (const t of terms) {
      const idx = t.indexOf("=");
      lines.push(`- ${t.slice(0, idx).trim()} => ${t.slice(idx + 1).trim()}`);
    }
  }

  lines.push(
    'Output JSON only, exactly this shape: {"translations":[{"id":1,"text":"..."}]}',
  );
  return lines.join("\n");
}
