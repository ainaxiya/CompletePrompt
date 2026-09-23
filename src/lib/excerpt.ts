// 从富文本/Markdown 内容提取纯文本摘要（无封面时用作卡片文字封面）
// 纯字符串操作，可在 server component 与 client component 中安全使用。

export function plainExcerpt(input: string | null | undefined, max = 90): string {
  if (!input) return "";
  let text = input;

  // 去掉代码块（保留内容容易出现乱码符号，封面只取自然语言）
  text = text.replace(/```[\s\S]*?```/g, " ");
  // 去掉 style/script
  text = text.replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  // 块级元素边界换行，避免去标签后文字粘连
  text = text.replace(/<\/(p|div|li|h[1-6]|br|tr|section|article|blockquote)>/gi, "\n");
  text = text.replace(/<br\s*\/?>(?:\n)?/gi, "\n");
  // Markdown 图片/视频 ![xx](url)
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  // 分段标记 [1] [12]
  text = text.replace(/^\s*\[\d+\]\s*$/gm, " ");
  // 去掉剩余 HTML 标签
  text = text.replace(/<[^>]+>/g, " ");
  // Markdown 链接 [文字](url) → 文字
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // 标题/强调符号
  text = text.replace(/^#{1,6}\s*/gm, "").replace(/[*_~`>#-]{2,}/g, "");
  // 常见 HTML 实体
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // 折叠空白
  text = text.replace(/[ \t　]+/g, " ").replace(/\n{2,}/g, "\n").trim();

  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "") + "…";
}
