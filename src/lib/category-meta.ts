import type { Locale } from "@/lib/i18n";

// 11 个固定分类的图标 key、主题色与中英名称/简介（slug 为 2 字母短码）
export type CategoryIconKey =
  | "video"
  | "audio"
  | "image"
  | "code"
  | "game"
  | "web"
  | "office"
  | "security"
  | "science"
  | "finance"
  | "agent";

export type CategoryMeta = {
  icon: CategoryIconKey;
  // 图标底色 / 图标描边色（tailwind 类名，需完整出现以被 JIT 扫描到）
  bg: string;
  fg: string;
  name: { zh: string; en: string };
  desc: { zh: string; en: string };
};

export const CATEGORY_META: Record<string, CategoryMeta> = {
  sp: {
    icon: "video",
    bg: "bg-sky-500/15",
    fg: "text-sky-300",
    name: { zh: "视频创作", en: "Video" },
    desc: {
      zh: "文生视频、动画短片、广告 TVC 等视频提示词",
      en: "Text-to-video, animated shorts, commercial TVC prompts",
    },
  },
  yp: {
    icon: "audio",
    bg: "bg-amber-500/15",
    fg: "text-amber-300",
    name: { zh: "音频创作", en: "Audio" },
    desc: {
      zh: "音乐生成、音效配音、播客有声书等音频提示词",
      en: "Music, sound effects, voiceover and podcast prompts",
    },
  },
  tp: {
    icon: "image",
    bg: "bg-rose-500/15",
    fg: "text-rose-300",
    name: { zh: "图片创作", en: "Images" },
    desc: {
      zh: "Midjourney、DALL·E、Stable Diffusion 等 AI 绘画提示词",
      en: "Midjourney, DALL·E, Stable Diffusion image prompts",
    },
  },
  bc: {
    icon: "code",
    bg: "bg-sky-500/15",
    fg: "text-sky-300",
    name: { zh: "编程开发", en: "Coding" },
    desc: {
      zh: "代码生成、调试优化、技术文档等编程辅助提示词",
      en: "Code generation, debugging and dev-documentation prompts",
    },
  },
  yx: {
    icon: "game",
    bg: "bg-emerald-500/15",
    fg: "text-emerald-300",
    name: { zh: "游戏设计", en: "Game Design" },
    desc: {
      zh: "游戏策划、资产生成、玩法关卡设计等提示词",
      en: "Game design, asset generation and gameplay prompts",
    },
  },
  wz: {
    icon: "web",
    bg: "bg-cyan-500/15",
    fg: "text-cyan-300",
    name: { zh: "网站开发", en: "Web Dev" },
    desc: {
      zh: "网页设计、前端组件、落地页与全栈开发提示词",
      en: "Web design, frontend components and landing page prompts",
    },
  },
  bg: {
    icon: "office",
    bg: "bg-orange-500/15",
    fg: "text-orange-300",
    name: { zh: "办公写作", en: "Writing" },
    desc: {
      zh: "文章撰写、文案创作、方案报告等办公写作提示词",
      en: "Articles, copywriting, reports and office writing prompts",
    },
  },
  wa: {
    icon: "security",
    bg: "bg-red-500/15",
    fg: "text-red-300",
    name: { zh: "网络安全", en: "Security" },
    desc: {
      zh: "渗透测试、安全审计、防护加固等网络安全提示词",
      en: "Penetration testing, audit and hardening security prompts",
    },
  },
  kx: {
    icon: "science",
    bg: "bg-teal-500/15",
    fg: "text-teal-300",
    name: { zh: "科学物理", en: "Science" },
    desc: {
      zh: "科学计算、物理仿真、实验数据分析等科研提示词",
      en: "Scientific computing, physics simulation and research prompts",
    },
  },
  jr: {
    icon: "finance",
    bg: "bg-yellow-500/15",
    fg: "text-yellow-300",
    name: { zh: "金融理财", en: "Finance" },
    desc: {
      zh: "投研分析、理财规划、风控建模等金融提示词",
      en: "Investment research, planning and risk-modeling prompts",
    },
  },
  zn: {
    icon: "agent",
    bg: "bg-cyan-500/15",
    fg: "text-cyan-300",
    name: { zh: "AI智能体", en: "AI Agents" },
    desc: {
      zh: "智能体工作流、自动化任务、工具调用等 Agent 提示词",
      en: "Agent workflows, task automation and tool-use prompts",
    },
  },
  qt: {
    icon: "agent",
    bg: "bg-zinc-700/40",
    fg: "text-zinc-300",
    name: { zh: "其他", en: "Other" },
    desc: { zh: "其他类型提示词", en: "Miscellaneous prompts" },
  },
};

// 旧中文 slug → 新 2 字母码（用于 301 重定向与数据迁移）
export const LEGACY_CAT_SLUG: Record<string, string> = {
  视频创作: "sp",
  音频创作: "yp",
  图片创作: "tp",
  编程开发: "bc",
  游戏设计: "yx",
  网站开发: "wz",
  办公写作: "bg",
  网络安全: "wa",
  科学物理: "kx",
  金融理财: "jr",
  AI智能体: "zn",
  其他: "qt",
};

export function getCategoryMeta(slug: string): CategoryMeta {
  return (
    CATEGORY_META[slug] || {
      icon: "agent",
      bg: "bg-zinc-700/40",
      fg: "text-zinc-300",
      name: { zh: slug, en: slug },
      desc: { zh: slug, en: slug },
    }
  );
}

export function categoryDesc(slug: string, locale: Locale): string {
  return getCategoryMeta(slug).desc[locale];
}

export function categoryName(slug: string, locale: Locale): string {
  return getCategoryMeta(slug).name[locale];
}
