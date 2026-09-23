"use client";

// 通用上传组件（基于开源 react-dropzone，MIT）：
// - 单选/多选、拖拽、点击选择；图片/视频类型与大小前置校验
// - 多文件并发上传（默认 3 路，逐文件调用单文件接口，服务端无需批量接口）
// - 每文件进度条、失败原因、单文件重试；父组件通过 onUploaded 逐个收到结果
// 单文件接口契约：POST FormData(field=<File>) → 200 { url, type?: "image"|"video", size? }

import { useEffect, useRef, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { useLocale, translate as t } from "@/lib/i18n-client";

export type UploadedFile = {
  name: string;
  url: string;
  type: "image" | "video";
  size: number;
};

type TaskStatus = "waiting" | "uploading" | "done" | "error";
type Task = {
  id: string;
  file: File;
  thumb: string;
  status: TaskStatus;
  progress: number;
  error?: string;
  reported?: boolean;
  result?: UploadedFile;
};

type AcceptKind = "image" | "video" | "all";

type Props = {
  /** 单选模式（封面/头像）；默认多选批量 */
  multiple?: boolean;
  accept?: AcceptKind;
  /** 还能添加几个文件（由父组件按 已有数量+上限 计算）；默认不限 */
  maxFiles?: number;
  maxImageMB?: number;
  maxVideoMB?: number;
  /** 同时上传的并发数 */
  concurrency?: number;
  endpoint?: string;
  fieldName?: string;
  /** 紧凑样式：虚线小按钮（适合单图场景） */
  compact?: boolean;
  disabled?: boolean;
  /** 自定义提示文案（默认走中英字典） */
  hint?: string;
  onUploaded: (files: UploadedFile[]) => void;
  /** 有文件被前置校验拒绝时回调（可选） */
  onRejected?: (count: number) => void;
};

const ACCEPT_MAP: Record<AcceptKind, Record<string, string[]>> = {
  image: { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"], "image/gif": [".gif"] },
  video: { "video/mp4": [".mp4"], "video/webm": [".webm"], "video/quicktime": [".mov"] },
  all: {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"],
    "image/gif": [".gif"],
    "video/mp4": [".mp4"],
    "video/webm": [".webm"],
    "video/quicktime": [".mov"],
  },
};

let seq = 0;
const nextId = () => `up-${Date.now()}-${seq++}`;

function humanSize(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

// XHR 上传（fetch 无法获取上传进度）
function xhrUpload(
  file: File,
  endpoint: string,
  fieldName: string,
  onProgress: (pct: number) => void
): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let d: any = null;
      try {
        d = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        d = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && d?.url) {
        resolve({
          name: file.name,
          url: d.url,
          type: d.type || (file.type.startsWith("video/") ? "video" : "image"),
          size: d.size ?? file.size,
        });
      } else {
        reject(new Error(d?.error || `HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("网络错误"));
    xhr.ontimeout = () => reject(new Error("上传超时"));
    const fd = new FormData();
    fd.append(fieldName, file);
    xhr.send(fd);
  });
}

export default function UniversalUploader({
  multiple = true,
  accept = "all",
  maxFiles,
  maxImageMB = 10,
  maxVideoMB = 100,
  concurrency = 3,
  endpoint = "/api/upload",
  fieldName = "file",
  compact = false,
  disabled = false,
  hint,
  onUploaded,
  onRejected,
}: Props) {
  const locale = useLocale();
  // 队列以 ref 为调度真相，state 仅用于渲染
  const queueRef = useRef<Task[]>([]);
  const runningRef = useRef(0);
  const cbRef = useRef(onUploaded);
  cbRef.current = onUploaded;
  const [, tick] = useState(0);
  const rerender = () => tick((x) => x + 1);

  useEffect(() => {
    return () => {
      queueRef.current.forEach((t) => URL.revokeObjectURL(t.thumb));
    };
  }, []);

  const pump = () => {
    while (runningRef.current < concurrency) {
      const t = queueRef.current.find((x) => x.status === "waiting");
      if (!t) break;
      t.status = "uploading";
      rerender();
      void run(t);
    }
  };

  const run = async (t: Task) => {
    runningRef.current += 1;
    try {
      const result = await xhrUpload(t.file, endpoint, fieldName, (pct) => {
        t.progress = pct;
        rerender();
      });
      t.status = "done";
      t.progress = 100;
      t.result = result;
      if (!t.reported) {
        t.reported = true;
        cbRef.current([result]);
      }
    } catch (e) {
      t.status = "error";
      t.error = (e as Error).message;
    } finally {
      runningRef.current -= 1;
      rerender();
      pump();
    }
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    multiple,
    accept: ACCEPT_MAP[accept],
    disabled,
    noClick: false,
    noKeyboard: false,
    useFsAccessApi: false,
    onDrop: (accepted: File[], rejections: FileRejection[]) => {
      if (rejections.length) onRejected?.(rejections.length);
      const slots =
        maxFiles === undefined
          ? accepted.length
          : Math.max(0, maxFiles - queueRef.current.filter((x) => x.status !== "error").length);
      const picked = accepted.slice(0, slots);
      if (!picked.length) return;
      const tasks: Task[] = picked.map((file) => ({
        id: nextId(),
        file,
        thumb: URL.createObjectURL(file),
        status: "waiting",
        progress: 0,
      }));
      queueRef.current.push(...tasks);
      rerender();
      pump();
    },
    validator: (file) => {
      const isImg = file.type.startsWith("image/");
      const isVid = file.type.startsWith("video/");
      if (accept === "image" && !isImg) return { code: "bad-type", message: t(locale, "publish.dropReject") };
      if (accept === "video" && !isVid) return { code: "bad-type", message: t(locale, "publish.dropReject") };
      if (!isImg && !isVid) return { code: "bad-type", message: t(locale, "publish.dropReject") };
      const limit = isImg ? maxImageMB : maxVideoMB;
      if (file.size > limit * 1024 * 1024) {
        return { code: "too-large", message: `>${limit}MB` };
      }
      return null;
    },
  });

  const retry = (id: string) => {
    const t = queueRef.current.find((x) => x.id === id);
    if (!t || t.status !== "error") return;
    t.status = "waiting";
    t.progress = 0;
    t.error = undefined;
    rerender();
    pump();
  };

  const clearDone = () => {
    const remain = queueRef.current.filter((t) => t.status !== "done");
    queueRef.current.forEach((t) => t.status === "done" && URL.revokeObjectURL(t.thumb));
    queueRef.current = remain;
    rerender();
  };

  const tasks = queueRef.current;
  const hasActive = tasks.some((t) => t.status === "waiting" || t.status === "uploading");
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const errCount = tasks.filter((t) => t.status === "error").length;

  if (compact) {
    const active = tasks.find((t) => t.status === "uploading" || t.status === "waiting");
    const failed = tasks.find((t) => t.status === "error");
    return (
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || !!active}
          onClick={open}
          className="rounded-lg border border-dashed border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-emerald-500 hover:text-emerald-300 disabled:opacity-50"
        >
          {active ? `${t(locale, "publish.uploading")} ${active.progress}%` : hint || t(locale, "publish.dropzoneSingle")}
        </button>
        {failed && (
          <button
            type="button"
            onClick={() => retry(failed.id)}
            className="text-xs text-rose-400 underline-offset-2 hover:underline"
          >
            {t(locale, "publish.retry")}（{failed.error}）
          </button>
        )}
        <input {...getInputProps()} />
      </span>
    );
  }

  return (
    <div>
      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
          isDragActive
            ? "border-emerald-500 bg-emerald-500/5"
            : "border-zinc-700 bg-zinc-900/40 hover:border-emerald-600/70 hover:bg-zinc-900"
        } ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        <input {...getInputProps()} />
        <p className="text-sm text-zinc-300">{hint || t(locale, "publish.dropzone")}</p>
        <p className="mt-1 text-xs text-zinc-500">
          JPG / PNG / WebP / GIF ≤ {maxImageMB}MB
          {accept !== "image" ? `　MP4 / WebM ≤ ${maxVideoMB}MB` : ""}
          {multiple && maxFiles !== undefined ? `　${locale === "zh" ? `最多 ${maxFiles} 个` : `up to ${maxFiles}`}` : ""}
        </p>
      </div>

      {tasks.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 px-2.5 py-1.5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {task.file.type.startsWith("image/") ? (
                <img src={task.thumb} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-zinc-800 text-[10px] text-zinc-400">
                  视频
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="truncate text-zinc-300">{task.file.name}</span>
                  <span className="shrink-0 text-zinc-600">{humanSize(task.file.size)}</span>
                  {task.status === "done" && <span className="shrink-0 text-emerald-400">✓</span>}
                </div>
                {task.status === "uploading" || task.status === "waiting" ? (
                  <div className="mt-1 h-1 overflow-hidden rounded bg-zinc-800">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${task.progress}%` }} />
                  </div>
                ) : task.status === "error" ? (
                  <div className="mt-0.5 flex items-center gap-2 text-xs">
                    <span className="truncate text-rose-400">{task.error}</span>
                    <button
                      type="button"
                      onClick={() => retry(task.id)}
                      className="shrink-0 text-emerald-400 underline-offset-2 hover:underline"
                    >
                      {t(locale, "publish.retry")}
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {(doneCount > 0 || errCount > 0) && !hasActive && (
        <div className="mt-2 flex items-center gap-3 text-xs">
          {doneCount > 0 && <span className="text-emerald-400">{doneCount} 个成功</span>}
          {errCount > 0 && <span className="text-rose-400">{errCount} 个失败</span>}
          {doneCount > 0 && (
            <button type="button" onClick={clearDone} className="text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline">
              {t(locale, "publish.clearDone")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
