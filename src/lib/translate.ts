import { createHash } from "crypto";
import { db } from "./db";
import { detectLang } from "./langdetect";

// 统一语言代码映射
function norm(code: string): string {
  if (code === "zh") return "zh-CN";
  return code;
}

// ---- Provider 1: MyMemory（匿名额度，按段翻译）----
async function translateMyMemory(text: string, sl: string, tl: string): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(sl)}|${encodeURIComponent(tl)}`;
  const r = await fetch(url, {
    headers: { "User-Agent": "CompletePrompt/2.0", Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`mymemory ${r.status}`);
  const j: any = await r.json();
  const out = j?.responseData?.translatedText;
  if (!out || /MYMEMORY WARNING/i.test(out)) throw new Error("mymemory quota");
  return out as string;
}

// ---- Provider 2: Google gtx（非官方端点，作为备用）----
async function translateGoogle(text: string, sl: string, tl: string): Promise<string> {
  const gsl = sl === "auto" ? "auto" : sl;
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${gsl}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`google ${r.status}`);
  const j = await r.json();
  return (j?.[0] || []).map((seg: any) => seg?.[0] ?? "").join("");
}

// 长文本按换行/句子边界切分为 <= 700 字符的块
function chunk(text: string, max = 700): string[] {
  const out: string[] = [];
  let buf = "";
  for (const line of text.split(/(\n+)/)) {
    if ((buf + line).length > max) {
      if (buf) out.push(buf);
      // 超长单行按句号硬切
      if (line.length > max) {
        for (let i = 0; i < line.length; i += max) out.push(line.slice(i, i + max));
        buf = "";
      } else {
        buf = line;
      }
    } else {
      buf += line;
    }
  }
  if (buf) out.push(buf);
  return out.filter(Boolean);
}

async function translateChunkRaw(text: string, sl: string, tl: string): Promise<string> {
  try {
    return await translateMyMemory(text, sl, tl);
  } catch {
    return translateGoogle(text, sl, tl);
  }
}

export function hashText(text: string): string {
  return createHash("sha1").update(text, "utf8").digest("hex");
}

/**
 * 翻译入口（带数据库缓存）。
 * sourceLang 可省略 → 自动检测。源语言 === 目标语言时直接返回 null（前端不显示翻译框）。
 */
export async function translateText(
  text: string,
  targetLang: "zh" | "en",
  sourceLang?: "zh" | "en"
): Promise<{ translated: string; sourceLang: "zh" | "en"; cached: boolean } | null> {
  const clean = text.trim();
  if (!clean) return null;
  const sl = sourceLang ?? detectLang(clean);
  const tl = targetLang;
  if (sl === tl) return null;

  const hash = hashText(`${sl}|${clean}`);
  const cached = await db.translationCache.findUnique({
    where: { hash_sourceLang_targetLang: { hash, sourceLang: sl, targetLang: tl } },
  });
  if (cached) return { translated: cached.translated, sourceLang: sl, cached: true };

  const tlCode = norm(tl);
  const slCode = norm(sl);
  const pieces = chunk(clean);
  const result: string[] = [];
  // 串行翻译避免触发限流
  for (const p of pieces) {
    result.push(await translateChunkRaw(p, slCode, tlCode));
  }
  const translated = result.join("");

  await db.translationCache
    .upsert({
      where: { hash_sourceLang_targetLang: { hash, sourceLang: sl, targetLang: tl } },
      update: { translated },
      create: { hash, sourceLang: sl, targetLang: tl, translated },
    })
    .catch(() => {});

  return { translated, sourceLang: sl, cached: false };
}
