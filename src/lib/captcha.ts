// 轻量算术验证码（单实例内存方案，与 rate-limit.ts 同前提：单 Node 进程部署）。
// 题目形如「7 + 5 = ?」「9 - 4 = ?」；答案存内存，5 分钟过期，校验后立即失效（一次性）。
import { randomBytes, randomInt } from "node:crypto";

type Entry = { answer: number; exp: number };

const store = new Map<string, Entry>();
const TTL_MS = 5 * 60_000;

function sweep() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.exp < now) store.delete(k);
  }
}

export type CaptchaIssue = { captchaId: string; question: string };

export function issueCaptcha(): CaptchaIssue {
  sweep();
  const a = randomInt(1, 10);
  const b = randomInt(1, 10);
  const plus = randomInt(0, 2) === 0;
  // 减法保证非负
  const [x, y] = plus ? [a, b] : a >= b ? [a, b] : [b, a];
  const answer = plus ? x + y : x - y;
  const captchaId = randomBytes(24).toString("hex");
  store.set(captchaId, { answer, exp: Date.now() + TTL_MS });
  return { captchaId, question: `${x} ${plus ? "+" : "−"} ${y} = ?` };
}

/** 校验答案；无论对错一次性消费（防爆破尝试）。过期/不存在返回 false。 */
export function consumeCaptcha(captchaId: unknown, answer: unknown): boolean {
  if (typeof captchaId !== "string" || typeof answer !== "string") return false;
  const v = store.get(captchaId);
  if (!v) return false;
  store.delete(captchaId);
  if (v.exp < Date.now()) return false;
  const n = Number(answer.trim());
  return Number.isInteger(n) && n === v.answer;
}
