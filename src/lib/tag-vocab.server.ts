import "server-only";
import { db } from "./db";
import { stripHtml } from "./rich";

// 从近期已发布提示词正文挖掘中文粘合词（2-4字），作为自动标签词库
// 思路：统计 unigram/bigram 频次，内部 bigram 的 PMI 足够高即为词
// 结果模块级缓存 30 分钟

type Cache = { at: number; terms: string[] };
let cache: Cache | null = null;
let inflight: Promise<string[]> | null = null;
const TTL = 30 * 60 * 1000;

// 不能作为词首/词尾的功能字（多字停用词拆开也覆盖边界）
const BOUNDARY_STOP = new Set(
  ("的 了 着 过 和 与 及 或 是 在 我 你 他 她 它 们 这 那 一 个 上 下 中 把 被 让 对 从 向 为 于 之 其 此 些 么 吗 呢 吧 啊 呀 哦 哈 嗯 不 没 有 能 会 要 可 以 也 都 就 还 又 再 很 太 最 更 等 但 而 且 并 则 若 如 因 所 由 给 到 至 往 朝 用 使 令 将 已 正 嘛 呗 啥 咋 怎 谁 某 每 另 乎 者 地 得 件 种 样 次 篇 张 条 款 类 型 式 段 挺 蛮 提 示 词 出 入 回 起 开 来 去 见 成 住 掉 完 走 说 看 想 做")
    .split(/\s+/)
);

function isCjk(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code >= 0x4e00 && code <= 0x9fff;
}

function buildVocab(text: string): string[] {
  const uni = new Map<string, number>();
  const bi = new Map<string, number>();
  const gram = new Map<string, number>();
  const N = text.length;

  for (let i = 0; i < N; i++) {
    const ch = text[i];
    if (!isCjk(ch)) continue;
    uni.set(ch, (uni.get(ch) || 0) + 1);
    if (i + 1 < N && isCjk(text[i + 1])) {
      const b = ch + text[i + 1];
      bi.set(b, (bi.get(b) || 0) + 1);
    }
    for (let n = 2; n <= 4 && i + n <= N; n++) {
      let ok = true;
      for (let j = i; j < i + n; j++) {
        if (!isCjk(text[j])) { ok = false; break; }
      }
      if (!ok) continue;
      const g = text.slice(i, i + n);
      gram.set(g, (gram.get(g) || 0) + 1);
    }
  }

  // PMI(raw)：c(bigram)*N / c(char1)*c(char2)，本语料（~1400万字）实测值域 8~数千
  const pmi = (b: string): number => {
    const c2 = bi.get(b) || 0;
    return (c2 * N) / ((uni.get(b[0]) || 1) * (uni.get(b[1]) || 1));
  };

  const MIN_CNT = 8;
  // 2字词数量大，阈值最高；长词允许更低（内部 bigram 多，天然更严）
  const TH: Record<number, number> = { 2: 60, 3: 12, 4: 25 };

  const scored: { term: string; score: number }[] = [];
  for (const [g, cnt] of gram) {
    if (cnt < MIN_CNT) continue;
    if (BOUNDARY_STOP.has(g[0]) || BOUNDARY_STOP.has(g[g.length - 1])) continue;
    let minPmi = Infinity;
    for (let i = 0; i < g.length - 1; i++) {
      minPmi = Math.min(minPmi, pmi(g.slice(i, i + 2)));
    }
    if (minPmi < TH[g.length]) continue;
    scored.push({ term: g, score: g.length * 100000 + minPmi * 10 + cnt });
  }

  // 高分（长且粘合）优先，截断到 20000，控制请求时匹配开销
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 20000).map((s) => s.term);
}

export async function getTagVocab(): Promise<string[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.terms;
  // 冷启动构建较慢（扫描上千万字），合并并发请求，避免重复构建
  if (inflight) return inflight;

  inflight = (async () => {
    const rows = await db.prompt.findMany({
      where: { status: "published" },
      orderBy: { id: "desc" },
      select: { content: true },
      take: 3000,
    });
    const text = rows.map((r) => stripHtml(r.content)).join("\n");
    const terms = buildVocab(text);
    cache = { at: Date.now(), terms };
    return terms;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
