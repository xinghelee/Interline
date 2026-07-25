/** 文本主体是否已是目标语言(按字符占比的粗略检测) */
export function looksLikeTargetLang(text: string, targetLang: string): boolean {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (letters === 0) return false;

  if (targetLang.includes("中文")) {
    const han = (text.match(/\p{Script=Han}/gu) ?? []).length;
    return han / letters > 0.5;
  }
  if (targetLang.includes("日本語")) {
    const jp = (
      text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []
    ).length;
    return jp / letters > 0.5;
  }
  if (/english/i.test(targetLang)) {
    const latin = (text.match(/\p{Script=Latin}/gu) ?? []).length;
    return latin / letters > 0.9;
  }
  return false;
}
