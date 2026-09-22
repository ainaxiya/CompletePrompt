// 富文本纯函数工具（服务端/客户端通用，不依赖 Node API）

// 判断内容是否为富文本 HTML（历史数据是纯文本 + [N] 分段标记）
export function isHtmlContent(s: string): boolean {
  return /<(p|br|img|video|source|h[1-6]|ul|ol|li|blockquote|div|iframe|strong|em|a)\b[\s>]/i.test(s || "");
}

// HTML -> 纯文本（保留段落换行）
export function stripHtml(html: string): string {
  if (!html) return "";
  let s = html;
  if (!isHtmlContent(s)) return s.replace(/^\[\d+\][^\n]*\n?/gm, "").trim();
  s = s
    .replace(/<\s*(br|\/p|\/div|\/h[1-6]|\/li|\/blockquote)[^>]*>/gi, "\n")
    .replace(/<\/(ul|ol)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ");
  // 去掉所有剩余标签
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

// 提取内容中第一张图片（<img> 或 Markdown 图片）
export function extractFirstImage(html: string): string | null {
  if (!html) return null;
  const img = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (img) return img[1];
  const md = html.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/);
  if (md) return md[1];
  // 视频封面 poster
  const poster = html.match(/<video[^>]+poster=["']([^"']+)["']/i);
  if (poster) return poster[1];
  return null;
}

// 自动简介：取纯文本第一段（截断到 120 字）
export function makeExcerpt(html: string, max = 120): string {
  const text = stripHtml(html).replace(/^\[\d+\][^\n]*/g, "").trim();
  const first = text.split("\n").find((l) => l.length > 0) || "";
  if (first.length <= max) return first;
  return first.slice(0, max).replace(/[,，、\s]+$/, "") + "…";
}

// 内联 <script> JSON 安全序列化：防止用户内容闭合 script 标签造成存储型 XSS
export function safeJsonScript(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/[\u2028\u2029]/g, (ch) => (ch === "\u2028" ? "\\u2028" : "\\u2029"));
}

// ————— 关键词/标签提取 —————

const STOP_ZH = new Set(
  ("的 了 和 是 在 我 你 他 她 它 们 这 那 一 个 上 下 中 与 及 或 等 也 都 就 还 能 会 要 可 以 不 没 有 个 把 被 让 对 从 向 为 于 之 其 此 该 每 些 什么 怎么 如何 一个 一种 可以 我们 你们 他们 以及 或者 但是 因为 所以 如果 然后 进行 通过 使用 需要 这个 那个 以及 提示 词 生成 创作 风格 效果 画面 场景")
    .split(/\s+/)
);
const STOP_EN = new Set(
  ("the a an and or but if then else of to in on at by for with from as is are was were be been being this that these those it its we you they i he she they our your their can could should would will shall may might must do does did have has had not no yes prompt generate create make use using used with style effect scene video image")
    .split(/\s+/)
);

/**
 * 提取标签：
 * 1) 优先匹配全站已有标签（专业词汇命中率高）
 * 2) 中文 2-4 字 n-gram 词频，英文词频
 */
export function extractTags(text: string, knownTags: string[] = [], limit = 8): string[] {
  const clean = stripHtml(text).replace(/^\[\d+\][^\n]*$/gm, "").slice(0, 4000);
  const picked: string[] = [];
  const seen = new Set<string>();

  const push = (tag: string) => {
    tag = tag.trim().replace(/[，。！？、,.!?;；:：""''（）()【】\[\]]/g, "");
    if (!tag || tag.length < 2 || tag.length > 12) return;
    if (STOP_ZH.has(tag)) return;
    if (seen.has(tag)) return;
    // 不选被已选词包含的短串
    for (const p of picked) if (p.includes(tag) && p !== tag) return;
    seen.add(tag);
    picked.push(tag);
  };

  // 1) 已有标签命中
  for (const tag of knownTags) {
    if (tag && clean.includes(tag)) push(tag);
    if (picked.length >= limit) return picked.slice(0, limit);
  }

  const isZh = /[一-鿿]/.test(clean);
  if (isZh) {
    // 2-4 字 n-gram 词频（扫描前 1500 字，控制开销）
    const sample = clean.slice(0, 1500);
    const freq = new Map<string, number>();
    for (let n = 4; n >= 2; n--) {
      for (let i = 0; i + n <= sample.length; i++) {
        const g = sample.slice(i, i + n);
        if (!/^[一-鿿]+$/.test(g)) continue;
        if (STOP_ZH.has(g[0]) || STOP_ZH.has(g[g.length - 1])) continue;
        freq.set(g, (freq.get(g) || 0) + 1);
      }
    }
    let ranked = [...freq.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] * b[0].length - a[1] * a[0].length);
    // 短文本（关键词多只出现 1 次）兜底：取 3-4 字 gram，按长度优先
    if (ranked.length === 0) {
      ranked = [...freq.entries()]
        .filter(([g]) => g.length >= 3)
        .sort((a, b) => b[0].length - a[0].length || b[1] - a[1])
        .slice(0, limit * 2);
    }
    for (const [g] of ranked) {
      push(g);
      if (picked.length >= limit) break;
    }
  } else {
    const words = clean.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || [];
    const freq = new Map<string, number>();
    for (const w of words) {
      if (STOP_EN.has(w) || w.length < 3) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
    let ranked = [...freq.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]);
    if (ranked.length === 0) {
      ranked = [...freq.entries()].sort((a, b) => b[0].length - a[0].length).slice(0, limit * 2);
    }
    for (const [w] of ranked) {
      push(w);
      if (picked.length >= limit) break;
    }
  }
  return picked.slice(0, limit);
}
