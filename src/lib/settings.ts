import { db } from "./db";

// 默认站点配置（后台"网站设置/基本设置/发布设置/会员设置"持久化到 SiteSetting）
export const DEFAULT_SETTINGS = {
  // site：后台「网站设置」页（标题/关键字/图标）持久化的键，优先级高于 basic
  site: {
    siteName: "",
    siteNameEn: "",
    siteDescription: "",
    searchKeywords: "",
    footerText: "",
    // null = 未在「网站设置」里显式配置，回退 register/basic
    allowRegister: null as boolean | null,
    logoIcon: "",
    favicon: "",
    appIcon: "",
    // 首页 banner 图（PC 横版 / 手机竖版，/site-assets/ 下的 URL）
    bannerPc: "",
    bannerMobile: "",
    // 友情链接：每行一条「名称|URL」，前台页脚 copyright 上方显示
    friendLinks: "",
    // 新内容自动提交 MeiliSearch 的间隔（秒）；0 = 永不自动更新
    meiliSyncSeconds: 30,
  },
  // 注册设置（后台「注册设置」页）
  register: {
    allowRegister: true,
    // 账号/密码固定必填；以下三个扩展字段：off=不收集，optional=可选，required=必填
    fields: {
      email: "off" as "off" | "optional" | "required",
      nickname: "optional" as "off" | "optional" | "required",
      phone: "off" as "off" | "optional" | "required",
    },
  },
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
  // 评论设置（后台「评论管理 → 敏感词库」与全站开关）
  comment: {
    // 全站评论总开关：false 时所有提示词评论区只读
    enabled: true,
    // 敏感词库：命中词整体替换为等长 * 后直发
    sensitiveWords: [] as string[],
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
  for (const key of ["site", "basic", "publish", "membership", "register", "comment"]) {
    if (map[key]) {
      try {
        merged[key] = { ...merged[key], ...JSON.parse(map[key]) };
      } catch {}
    }
  }
  cache = { data: merged, ts: Date.now() };
  return merged;
}

export async function saveSetting(
  key: "site" | "basic" | "publish" | "membership" | "register" | "comment",
  value: unknown
) {
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

const DEFAULT_KEYWORDS = [
  "AI提示词", "prompt", "Midjourney", "即梦", "可灵",
  "AI绘画", "AI视频", "CompletePrompt", "完整提示词",
];

/**
 * 前台统一配置：后台「网站设置」(site 键) 的非空值覆盖 basic 默认值。
 * 所有前台页面/元信息/注册开关都应只读这里，保证后台改了立即生效。
 */
export async function getPublicSite() {
  const s = await getSettings();
  const site = s.site;
  const reg = s.register;
  const pick = (v: string | undefined | null, fallback: string) =>
    v && v.trim() ? v.trim() : fallback;

  const keywords = (site.searchKeywords || "")
    .split(/[,，、；;\n\r\t]+|\s{2,}/)
    .map((k) => k.trim())
    .filter(Boolean);

  // 早期上传的图标 URL 写在 public 根（/logo-icon-120.png 等），生产环境 404；
  // 自动改写到 /site-assets/ 动态路由（favicon.ico 与内置默认同名，不做改写）
  const LEGACY_ROOT_ASSETS = new Set(["logo-icon-120.png", "app-icon.png"]);
  const toAssetUrl = (v?: string | null) => {
    const u = (v || "").trim();
    const m = u.match(/^\/([^/?]+)(\?.*)?$/);
    if (m && LEGACY_ROOT_ASSETS.has(m[1])) return `/site-assets/${m[1]}${m[2] || ""}`;
    return u;
  };

  const logoIcon = toAssetUrl(site.logoIcon);
  const appIcon = toAssetUrl(site.appIcon) || "/icon-512.png";

  // 友情链接：每行「名称|URL」（也容忍逗号分隔），仅放行 http(s) 链接
  const friendLinks = (site.friendLinks || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.split(/\s*[|,，]\s*/).filter(Boolean);
      return m.length >= 2 && /^https?:\/\//i.test(m[1]) ? { name: m[0], url: m[1] } : null;
    })
    .filter((x): x is { name: string; url: string } => !!x)
    .slice(0, 20);

  return {
    siteName: pick(site.siteName, s.basic.siteName),
    siteNameEn: pick(site.siteNameEn, s.basic.siteNameEn),
    description: pick(site.siteDescription, s.basic.siteDescription),
    footerText: pick(site.footerText, s.basic.footerText),
    keywords: keywords.length ? keywords : DEFAULT_KEYWORDS,
    // 注册开关优先级：注册设置页 > 网站设置页 > 内置默认
    allowRegister: reg.allowRegister ?? site.allowRegister ?? s.basic.allowRegister,
    // 注册扩展字段配置（off/optional/required），前台注册页据此渲染
    registerFields: reg.fields,
    // 图标：后台上传后走 /site-assets/ 动态服务；未配置则回退内置品牌资源
    logoIcon,
    favicon: site.favicon || "/favicon.ico",
    favicon32: site.favicon || "/favicon-32.png",
    appIcon,
    icon192: site.appIcon ? appIcon : "/icon-192.png",
    appleIcon: site.appIcon ? appIcon : "/apple-touch-icon.png",
    bannerPc: (site.bannerPc || "").trim(),
    bannerMobile: (site.bannerMobile || "").trim(),
    friendLinks,
  };
}
