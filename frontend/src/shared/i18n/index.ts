/**
 * English / Macedonian. The English text is the key: `t("Run simulation")`, and `t("{n} fields", { n })` for values.
 * A missing translation shows the English, never a blank. Translations live in mk.ts.
 *
 * `t` is a plain function, usable anywhere, including constants at the top of a module: the language is read before
 * any module that imports this one runs. Switching language saves the choice and reloads the page, so every text
 * (constants, and sentences the backend already sent) comes back in the new language.
 *
 * The backend translates its own sentences (findings, recommendations, assumptions) from the Accept-Language
 * header that shared/api/http.ts sends (see backend/app/shared/i18n.py).
 */
import { useSyncExternalStore } from "react";
import { MK } from "./mk";

export type Lang = "en" | "mk";
export const LANGS: { id: Lang; label: string; name: string }[] = [
  { id: "en", label: "EN", name: "English" },
  { id: "mk", label: "МК", name: "Македонски" },
];

const KEY = "agromind.lang";
let current: Lang = initial();
const listeners = new Set<() => void>();

function initial(): Lang {
  try {
    const fromAddress = new URLSearchParams(window.location.search).get("lang");
    if (fromAddress === "mk" || fromAddress === "en") return fromAddress;
    const saved = localStorage.getItem(KEY);
    if (saved === "mk" || saved === "en") return saved;
  } catch {
    /* storage blocked */
  }
  return "en";
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* storage blocked: the choice lasts for this visit */
  }
  document.documentElement.lang = lang;
  listeners.forEach((f) => f());
  // A ?lang= in the address would win after the reload, so it follows the choice.
  const url = new URL(window.location.href);
  if (url.searchParams.has("lang")) {
    url.searchParams.set("lang", lang);
    window.location.replace(url);
  } else {
    window.location.reload();
  }
}

/** The language, and a setter. Components that call it re-render on a switch (App does, so everything does). */
export function useLanguage(): [Lang, (l: Lang) => void] {
  const lang = useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, getLang);
  return [lang, setLang];
}

/** Translate `text` into the current language, filling `{name}` placeholders from `vars`. */
export function t(text: string, vars?: Record<string, string | number | null | undefined>): string {
  const s = current === "mk" ? (MK[text] ?? text) : text;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? "") : m)) : s;
}

/**
 * Plurals: `tn(n, "{n} field", "{n} fields")`. Macedonian has the same two forms (1 and everything else), so the
 * two English keys each get their own translation.
 */
export function tn(n: number, one: string, other: string, vars?: Record<string, string | number | null | undefined>): string {
  return t(n === 1 ? one : other, { n, ...vars });
}

/** The locale for dates and numbers in the current language. */
export function locale(): string {
  return current === "mk" ? "mk-MK" : "en-GB";
}

const MK_MONTHS_SHORT = ["јан", "фев", "мар", "апр", "мај", "јун", "јул", "авг", "сеп", "окт", "ное", "дек"];
const MK_MONTHS_LONG = ["јануари", "февруари", "март", "април", "мај", "јуни", "јули", "август", "септември", "октомври",
  "ноември", "декември"];

/**
 * A date (and time, if `o.hour` is set) in the current language. Macedonian is written out here rather than left
 * to Intl, because browsers without Macedonian locale data silently fall back to US English ("Jul 27, 2012").
 */
export function formatDate(d: Date, o: Intl.DateTimeFormatOptions): string {
  if (current !== "mk") return o.hour ? d.toLocaleString(locale(), o) : d.toLocaleDateString(locale(), o);
  const utc = o.timeZone === "UTC";
  const day = utc ? d.getUTCDate() : d.getDate();
  const month = utc ? d.getUTCMonth() : d.getMonth();
  const year = utc ? d.getUTCFullYear() : d.getFullYear();
  const parts = [o.day ? String(day) : null, o.month ? (o.month === "long" ? MK_MONTHS_LONG : MK_MONTHS_SHORT)[month] : null,
    o.year ? String(year) : null].filter(Boolean);
  let out = parts.join(" ");
  if (o.hour) {
    const h = utc ? d.getUTCHours() : d.getHours();
    const m = utc ? d.getUTCMinutes() : d.getMinutes();
    out += `, ${h}:${String(m).padStart(2, "0")}`;
  }
  return out;
}

/** HTTP header value for the backend's translations. */
export function acceptLanguage(): string {
  return current === "mk" ? "mk" : "en";
}

if (typeof document !== "undefined") document.documentElement.lang = current;
