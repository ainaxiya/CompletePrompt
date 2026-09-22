import { cookies } from "next/headers";
import { DICT, LOCALE_COOKIE, translate, type Locale, type DictKey } from "./dict";

export { DICT, LOCALE_COOKIE, translate };
export type { Locale, DictKey };

export async function getServerLocale(): Promise<Locale> {
  const store = await cookies();
  const v = store.get(LOCALE_COOKIE)?.value;
  return v === "en" ? "en" : "zh";
}
