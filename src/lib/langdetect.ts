// 内容原文语言检测：当前支持 zh / en，未来可扩展更多语种。
// 策略：统计中日韩字符占比，CJK 占比 > 8% 判定为中文，否则英文（兜底 en）。
export function detectLang(text: string): "zh" | "en" {
  if (!text) return "en";
  let cjk = 0;
  let letters = 0;
  const sample = text.slice(0, 4000);
  for (const ch of sample) {
    const code = ch.codePointAt(0) || 0;
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0xf900 && code <= 0xfaff)
    ) {
      cjk++;
      letters++;
    } else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
      letters++;
    }
  }
  if (letters === 0) return "en";
  return cjk / letters > 0.08 ? "zh" : "en";
}
