// 评论系统策略常量与纯逻辑（限频阈值、敏感词屏蔽）
// 所有阈值集中在此，调整无需翻接口代码。

export const COMMENT = {
  /** 单条评论最大长度 */
  MAX_LEN: 1000,
  /** 顶级评论每页条数 */
  PAGE_SIZE: 20,
  /** 硬限频窗口 */
  HARD_WINDOW_MS: 60_000,
  /** 窗口内最多评论数（达到即拒） */
  HARD_LIMIT: 6,
  /** 窗口内达到该条数起要求验证码 */
  CAPTCHA_THRESHOLD: 4,
  /** 一旦触发验证码，要求持续的时长 */
  CAPTCHA_ARMED_MS: 10 * 60_000,
} as const;

export type MaskResult = {
  text: string;
  /** 命中的敏感词（去重后的原词） */
  hits: string[];
};

/**
 * 敏感词替换：命中的词整体替换为等长 *（例：「坏蛋」→「**」）。
 * - 词按长度降序匹配，避免短词抢先遮蔽长词
 * - 转义正则元字符
 * - 大小写不敏感（中文无效、英文有效）
 */
export function maskSensitive(input: string, rawWords: string[]): MaskResult {
  const words = Array.from(
    new Set(rawWords.map((w) => w.trim()).filter((w) => w.length >= 1))
  ).sort((a, b) => b.length - a.length);

  if (!words.length || !input) return { text: input, hits: [] };

  const hits = new Set<string>();
  let text = input;
  for (const w of words) {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "gi");
    if (re.test(text)) {
      hits.add(w);
      text = text.replace(re, "*".repeat(w.length));
    }
  }
  return { text, hits: Array.from(hits) };
}
