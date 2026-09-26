import "server-only";
import sanitizeHtml from "sanitize-html";
import { isHtmlContent } from "./rich";

// 富文本白名单清洗：仅编辑器产出的安全标签；iframe 限定 YouTube/Bilibili
export function sanitizeRich(input: string): string {
  if (!input) return "";
  // 历史纯文本原样保留（详情页走旧的 [N] 分段渲染）
  if (!isHtmlContent(input)) return input.trim();

  return sanitizeHtml(input, {
    allowedTags: [
      "p", "br", "b", "strong", "i", "em", "u", "s", "h1", "h2", "h3",
      "ul", "ol", "li", "blockquote", "a", "img", "video", "source",
      "iframe", "div", "span", "pre", "code",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "class"],
      video: ["src", "controls", "poster", "class"],
      source: ["src", "type"],
      iframe: ["src", "class", "allowfullscreen", "frameborder", "allow"],
      span: ["class"],
      div: ["class"],
      p: ["class"],
      pre: ["class", "data-language"],
      code: ["class"],
    },
    allowedSchemes: ["http", "https", "data"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowedIframeHostnames: [
      "www.youtube.com",
      "youtube.com",
      "youtube-nocookie.com",
      "www.youtube-nocookie.com",
      "player.bilibili.com",
    ],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener nofollow" }),
    },
  }).trim();
}
