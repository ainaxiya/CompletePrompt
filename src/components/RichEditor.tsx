"use client";

import { useEffect, useMemo, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { isHtmlContent } from "@/lib/rich";
import UniversalUploader from "@/components/UniversalUploader";
import { TiptapVideo } from "./editor/TiptapVideo";

// 纯文本（历史数据）转成可编辑 HTML
function plainToHtml(s: string): string {
  if (!s) return "";
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  maxImageMB?: number;
  maxVideoMB?: number;
};

export default function RichEditor({
  value,
  onChange,
  placeholder,
  minHeight = 280,
  maxImageMB = 10,
  maxVideoMB = 100,
}: Props) {
  // 初始内容：富文本直接用；历史纯文本剥掉 [n] 分段标记后转 HTML
  const initialHtml = useMemo(() => {
    return isHtmlContent(value)
      ? value
      : plainToHtml(value.replace(/^\[\d+\][^\n]*\n?/gm, ""));
    // 仅挂载时计算一次（异步加载由下面的 value 同步 effect 兜底）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const lastEmitted = useRef("");

  const editor = useEditor({
    immediatelyRender: false,
    content: initialHtml,
    editorProps: {
      attributes: {
        class: "rich-content tiptap-prose px-4 py-3 text-sm leading-relaxed outline-none",
        spellcheck: "false",
      },
    },
    extensions: [
      StarterKit.configure({
        // 与 sanitizeRich 白名单对齐：只允许 h2/h3
        heading: { levels: [2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener nofollow",
        },
      }),
      Image.configure({
        inline: false,
        HTMLAttributes: { class: "rich-media" },
      }),
      TiptapVideo,
      Placeholder.configure({
        placeholder: placeholder || "",
      }),
    ],
    onUpdate: (e) => {
      const html = e.editor.getHTML();
      lastEmitted.current = html;
      onChange(html);
    },
  });

  // 外部 value 变化（后台编辑异步加载完成）时同步进编辑器；
  // 自己 onUpdate 产生的值（lastEmitted）不再回灌，避免光标跳动
  useEffect(() => {
    if (!editor || !value) return;
    if (value === lastEmitted.current) return;
    const html = isHtmlContent(value)
      ? value
      : plainToHtml(value.replace(/^\[\d+\][^\n]*\n?/gm, ""));
    editor.commands.setContent(html, { emitUpdate: false });
    lastEmitted.current = value;
  }, [editor, value]);

  useEffect(() => () => editor?.destroy(), [editor]);

  const addLink = (ed: Editor) => {
    const existing = ed.getAttributes("link").href as string | undefined;
    const url = window.prompt(existing ? "修改链接地址（留空取消链接）：" : "链接地址（https://…）：", existing || "");
    if (url === null) return;
    const u = url.trim();
    if (!u) {
      ed.chain().focus().unsetLink().run();
      return;
    }
    const href = /^https?:\/\//i.test(u) ? u : `https://${u}`;
    ed.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 focus-within:border-emerald-500">
      {editor && <Toolbar editor={editor} addLink={addLink} maxImageMB={maxImageMB} maxVideoMB={maxVideoMB} />}
      <EditorContent
        editor={editor}
        style={{ minHeight, maxHeight: 600, overflowY: "auto" }}
      />
    </div>
  );
}

function ToolBtn({
  editor,
  title,
  onClick,
  active,
  children,
}: {
  editor: Editor;
  title: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      // onMouseDown 阻止按钮抢焦点，编辑选区不丢失
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`flex h-8 min-w-8 items-center justify-center rounded px-2 text-sm transition ${
        active
          ? "bg-emerald-500/20 text-emerald-300"
          : "text-zinc-300 hover:bg-zinc-700 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-1 h-4 w-px bg-zinc-700" />;

function Toolbar({
  editor,
  addLink,
  maxImageMB,
  maxVideoMB,
}: {
  editor: Editor;
  addLink: (ed: Editor) => void;
  maxImageMB: number;
  maxVideoMB: number;
}) {
  const insertImage = (url: string) =>
    editor.chain().focus().setImage({ src: url }).run();
  const insertVideo = (url: string) =>
    editor.chain().focus().setVideo({ src: url }).run();

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-zinc-800 bg-zinc-950/60 px-2 py-1">
      <ToolBtn editor={editor} title="加粗" active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}>
        <b>B</b>
      </ToolBtn>
      <ToolBtn editor={editor} title="斜体" active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}>
        <i>I</i>
      </ToolBtn>
      <ToolBtn editor={editor} title="下划线" active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <u>U</u>
      </ToolBtn>
      <ToolBtn editor={editor} title="删除线" active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}>
        <s>S</s>
      </ToolBtn>
      <Sep />
      <ToolBtn editor={editor} title="大标题" active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        H2
      </ToolBtn>
      <ToolBtn editor={editor} title="小标题" active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        H3
      </ToolBtn>
      <ToolBtn editor={editor} title="正文" active={editor.isActive("paragraph")}
        onClick={() => editor.chain().focus().setParagraph().run()}>
        ¶
      </ToolBtn>
      <ToolBtn editor={editor} title="引用" active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        ❝
      </ToolBtn>
      <Sep />
      <ToolBtn editor={editor} title="无序列表" active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}>
        •≡
      </ToolBtn>
      <ToolBtn editor={editor} title="有序列表" active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        1≡
      </ToolBtn>
      <ToolBtn editor={editor} title="行内代码" active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}>
        {"</>"}
      </ToolBtn>
      <ToolBtn editor={editor} title="链接" active={editor.isActive("link")}
        onClick={() => addLink(editor)}>
        🔗
      </ToolBtn>
      <Sep />
      {/* 媒体上传一律走 UniversalUploader（dropzone/进度/重试） */}
      <UniversalUploader
        compact
        multiple={false}
        accept="image"
        maxFiles={1}
        maxImageMB={maxImageMB}
        hint="🖼️ 图片"
        onUploaded={(files) => files[0] && insertImage(files[0].url)}
      />
      <UniversalUploader
        compact
        multiple={false}
        accept="video"
        maxFiles={1}
        maxVideoMB={maxVideoMB}
        hint="🎬 视频"
        onUploaded={(files) => files[0] && insertVideo(files[0].url)}
      />
      <Sep />
      <ToolBtn editor={editor} title="撤销"
        onClick={() => editor.chain().focus().undo().run()}>
        ↶
      </ToolBtn>
      <ToolBtn editor={editor} title="重做"
        onClick={() => editor.chain().focus().redo().run()}>
        ↷
      </ToolBtn>
    </div>
  );
}
