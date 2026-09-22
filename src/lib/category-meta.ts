import type { Locale } from "@/lib/i18n";

// 11 个固定分类的图标 key、主题色与中英简介（slug 即中文名）
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
  desc: { zh: string; en: string };
};

export const CATEGORY_META: Record<string, CategoryMeta> = {
  视频创作: {
    icon: "video",
    bg: "bg-sky-500/15",
    fg: "text-sky-300",
    desc: {
      zh: "文生视频、动画短片、广告 TVC 等视频提示词",
      en: "Text-to-video, animated shorts, commercial TVC prompts",
    },
  },
  音频创作: {
    icon: "audio",
    bg: "bg-amber-500/15",
    fg: "text-amber-300",
    desc: {
      zh: "音乐生成、音效配音、播客有声书等音频提示词",
      en: "Music, sound effects, voiceover and podcast prompts",
    },
  },
  图片创作: {
    icon: "image",
    bg: "bg-rose-500/15",
    fg: "text-rose-300",
    desc: {
      zh: "Midjourney、DALL·E、Stable Diffusion 等 AI 绘画提示词",
      en: "Midjourney, DALL·E, Stable Diffusion image prompts",
    },
  },
  编程开发: {
    icon: "code",
    bg: "bg-sky-500/15",
    fg: "text-sky-300",
    desc: {
      zh: "代码生成、调试优化、技术文档等编程辅助提示词",
      en: "Code generation, debugging and dev-documentation prompts",
    },
  },
  游戏设计: {
    icon: "game",
    bg: "bg-emerald-500/15",
    fg: "text-emerald-300",
    desc: {
      zh: "游戏策划、资产生成、玩法关卡设计等提示词",
      en: "Game design, asset generation and gameplay prompts",
    },
  },
  网站开发: {
    icon: "web",
    bg: "bg-cyan-500/15",
    fg: "text-cyan-300",
    desc: {
      zh: "网页设计、前端组件、落地页与全栈开发提示词",
      en: "Web design, frontend components and landing page prompts",
    },
  },
  办公写作: {
    icon: "office",
    bg: "bg-orange-500/15",
    fg: "text-orange-300",
    desc: {
      zh: "文章撰写、文案创作、方案报告等办公写作提示词",
      en: "Articles, copywriting, reports and office writing prompts",
    },
  },
  网络安全: {
    icon: "security",
    bg: "bg-red-500/15",
    fg: "text-red-300",
    desc: {
      zh: "渗透测试、安全审计、防护加固等网络安全提示词",
      en: "Penetration testing, audit and hardening security prompts",
    },
  },
  科学物理: {
    icon: "science",
    bg: "bg-teal-500/15",
    fg: "text-teal-300",
    desc: {
      zh: "科学计算、物理仿真、实验数据分析等科研提示词",
      en: "Scientific computing, physics simulation and research prompts",
    },
  },
  金融理财: {
    icon: "finance",
    bg: "bg-yellow-500/15",
    fg: "text-yellow-300",
    desc: {
      zh: "投研分析、理财规划、风控建模等金融提示词",
      en: "Investment research, planning and risk-modeling prompts",
    },
  },
  AI智能体: {
    icon: "agent",
    bg: "bg-cyan-500/15",
    fg: "text-cyan-300",
    desc: {
      zh: "智能体工作流、自动化任务、工具调用等 Agent 提示词",
      en: "Agent workflows, task automation and tool-use prompts",
    },
  },
};

export function getCategoryMeta(slug: string): CategoryMeta {
  return (
    CATEGORY_META[slug] || {
      icon: "agent",
      bg: "bg-zinc-700/40",
      fg: "text-zinc-300",
      desc: { zh: slug, en: slug },
    }
  );
}

export function categoryDesc(slug: string, locale: Locale): string {
  return getCategoryMeta(slug).desc[locale];
}
