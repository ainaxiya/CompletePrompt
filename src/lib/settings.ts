import { db } from "./db";

// 默认站点配置（后台"基本设置/发布设置/会员设置"持久化到 SiteSetting）
export const DEFAULT_SETTINGS = {
  basic: {
    siteName: "完整提示词",
    siteNameEn: "CompletePrompt",
    siteDescription:
      "收集、分享、发现优质 AI 提示词：图片生成、视频生成、音频生成、分镜脚本，真实创作过程提示词免费复制使用。",
    footerText: "完整提示词 · 部分内容采集自公开社区，仅作学习交流",
    allowRegister: true,
    defaultLocale: "zh",
  },
  publish: {
    // auto = 发布即上线；review = 需后台审核
    mode: "auto",
    allowedTypes: ["text", "image", "video", "audio"],
    minTitleLen: 2,
    maxContentLen: 100000,
    // 上传限制
    allowUpload: true,
    allowEmbed: true,
    maxImageMB: 10,
    maxVideoMB: 100,
    maxMediaPerPrompt: 9,
  },
  membership: {
    tiers: [
      {
        level: "free",
        name: { zh: "免费用户", en: "Free" },
        price: 0,
        features: { zh: "浏览、搜索、发布提示词", en: "Browse, search, publish prompts" },
      },
      {
        level: "pro",
        name: { zh: "Pro 会员", en: "Pro" },
        price: 29,
        features: { zh: "免费会员全部权益 + 高清媒体上传 + 自动翻译不限量", en: "Everything in Free + HD media upload + unlimited auto-translation" },
      },
      {
        level: "vip",
        name: { zh: "VIP 会员", en: "VIP" },
        price: 99,
        features: { zh: "Pro 全部权益 + 作品优先推荐 + 专属标识", en: "Everything in Pro + featured priority + exclusive badge" },
      },
    ],
  },
};

export type SiteSettings = typeof DEFAULT_SETTINGS;

let cache: { data: SiteSettings; ts: number } | null = null;
const TTL = 30_000;

export async function getSettings(): Promise<SiteSettings> {
  if (cache && Date.now() - cache.ts < TTL) return cache.data;
  const rows = await db.siteSetting.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const merged = structuredClone(DEFAULT_SETTINGS) as any;
  for (const key of ["basic", "publish", "membership"]) {
    if (map[key]) {
      try {
        merged[key] = { ...merged[key], ...JSON.parse(map[key]) };
      } catch {}
    }
  }
  cache = { data: merged, ts: Date.now() };
  return merged;
}

export async function saveSetting(key: "basic" | "publish" | "membership", value: unknown) {
  const json = JSON.stringify(value);
  await db.siteSetting.upsert({
    where: { key },
    update: { value: json },
    create: { key, value: json },
  });
  cache = null;
}

// 供非 async 模块使用的同步默认值
export const defaultSettings = DEFAULT_SETTINGS;
