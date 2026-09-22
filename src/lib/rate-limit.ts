// 轻量内存速率限制（单实例部署足够；多实例需替换为 Redis）
// 滑动窗口：同一 key 在 windowMs 内最多 hit 次。

const buckets = new Map<string, number[]>();
let lastSweep = 0;

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  // 每 5 分钟清理一次过期桶
  if (now - lastSweep > 300_000) {
    for (const [k, arr] of buckets) {
      const fresh = arr.filter((t) => now - t < windowMs);
      if (fresh.length === 0) buckets.delete(k);
      else buckets.set(k, fresh);
    }
    lastSweep = now;
  }

  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return false; // 已超限
  }
  arr.push(now);
  buckets.set(key, arr);
  return true;
}

// 从请求中取客户端 IP（反向代理后取 x-forwarded-for 首段）
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

// 仅允许站内相对路径（防开放重定向）
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
