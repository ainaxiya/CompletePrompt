// 客户端翻译请求队列：免费翻译接口有速率限制，
// 全页几十个分段时限制并发，避免 429 导致整页翻译失败。

type Resp = { translated?: string; skipped?: boolean; sourceLang?: string; cached?: boolean; error?: string };

let active = 0;
const waiters: (() => void)[] = [];

async function slot() {
  if (active < 2) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
}
function release() {
  active--;
  const next = waiters.shift();
  if (next) next();
}

async function one(body: string): Promise<Resp> {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  return res.json();
}

export async function queuedTranslate(payload: {
  text: string;
  target: "zh" | "en";
  source?: "zh" | "en";
}): Promise<Resp> {
  const body = JSON.stringify(payload);
  await slot();
  try {
    // 一次重试，吸收偶发限流
    let r = await one(body);
    if (r.error) {
      await new Promise((x) => setTimeout(x, 1200));
      r = await one(body);
    }
    return r;
  } finally {
    release();
  }
}
