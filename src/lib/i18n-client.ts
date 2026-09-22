"use client";

import { useEffect, useState } from "react";
import { DICT, LOCALE_COOKIE, translate, type Locale, type DictKey } from "./dict";

export { DICT, LOCALE_COOKIE, translate };
export type { Locale, DictKey };

export function getClientLocale(): Locale {
  if (typeof document === "undefined") return "zh";
  const m = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
  return m?.[1] === "en" ? "en" : "zh";
}

/**
 * 挂载前固定返回 "zh"（与 SSR 一致），挂载后读取 cookie 真实语言，
 * 避免服务端/客户端文本不一致导致的 hydration mismatch。
 */
export function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>("zh");
  useEffect(() => {
    setLocale(getClientLocale());
  }, []);
  return locale;
}

export function useT(locale: Locale) {
  return (key: DictKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
}
