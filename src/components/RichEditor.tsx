"use client";

import { useRef } from "react";
import { isHtmlContent } from "@/lib/rich";

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
};

export default function RichEditor({ value, onChange, placeholder, minHeight = 280 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const initial = useRef(
    isHtmlContent(value) ? value : plainToHtml(value.replace(/^\[\d+\][^\n]*\n?/gm, ""))
  );
  const imgInput = useRef<HTMLInputElement>(null);
  const vidInput = useRef<HTMLInputElement>(null);
  const busy = useRef(false);

  const saveRange = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreRange = () => {
    ref.current?.focus();
    const sel = window.getSelection();
    if (!sel) return;
    if (savedRange.current) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  };

  const cmd = (command: string, arg?: string) => {
    restoreRange();
    document.execCommand(command, false, arg);
    emit();
  };

  const emit = () => {
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const insertHtml = (html: string) => {
    restoreRange();
    document.execCommand("insertHTML", false, html);
    emit();
  };

  const addLink = () => {
    const url = prompt("链接地址（https://…）：");
    if (url) cmd("createLink", url);
  };

  const upload = async (file: File, kind: "image" | "video") => {
    if (busy.current || !file) return;
    busy.current = true;
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) return alert(d.error || "上传失败");
      if (kind === "image") {
        insertHtml(`<img src="${d.url}" alt="" class="rich-media"/>`);
      } else {
        insertHtml(`<video controls src="${d.url}" class="rich-media"></video><p><br></p>`);
      }
      saveRange();
    } catch {
      alert("上传失败");
    } finally {
      busy.current = false;
    }
  };

  const Btn = ({ title, onMouseDown, children }: { title: string; onMouseDown: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onMouseDown();
      }}
      className="flex h-8 min-w-8 items-center justify-center rounded px-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white"
    >
      {children}
    </button>
  );

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 focus-within:border-emerald-500">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-zinc-800 bg-zinc-950/60 px-2 py-1">
        <Btn title="加粗" onMouseDown={() => cmd("bold")}><b>B</b></Btn>
        <Btn title="斜体" onMouseDown={() => cmd("italic")}><i>I</i></Btn>
        <Btn title="下划线" onMouseDown={() => cmd("underline")}><u>U</u></Btn>
        <span className="mx-1 h-4 w-px bg-zinc-700" />
        <Btn title="大标题" onMouseDown={() => cmd("formatBlock", "h2")}>H2</Btn>
        <Btn title="小标题" onMouseDown={() => cmd("formatBlock", "h3")}>H3</Btn>
        <Btn title="正文" onMouseDown={() => cmd("formatBlock", "p")}>¶</Btn>
        <Btn title="引用" onMouseDown={() => cmd("formatBlock", "blockquote")}>❝</Btn>
        <span className="mx-1 h-4 w-px bg-zinc-700" />
        <Btn title="无序列表" onMouseDown={() => cmd("insertUnorderedList")}>•≡</Btn>
        <Btn title="有序列表" onMouseDown={() => cmd("insertOrderedList")}>1≡</Btn>
        <Btn title="链接" onMouseDown={addLink}>🔗</Btn>
        <span className="mx-1 h-4 w-px bg-zinc-700" />
        <Btn title="插入图片（上传）" onMouseDown={() => imgInput.current?.click()}>🖼️</Btn>
        <Btn title="插入视频（上传）" onMouseDown={() => vidInput.current?.click()}>🎬</Btn>
        <input
          ref={imgInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f, "image");
            e.target.value = "";
          }}
        />
        <input
          ref={vidInput}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f, "video");
            e.target.value = "";
          }}
        />
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder || ""}
        onInput={emit}
        onBlur={emit}
        onKeyUp={saveRange}
        onMouseUp={saveRange}
        className="rich-content max-h-[600px] min-h-[200px] overflow-y-auto px-4 py-3 text-sm leading-relaxed outline-none"
        style={{ minHeight }}
        dangerouslySetInnerHTML={{ __html: initial.current }}
      />
    </div>
  );
}
