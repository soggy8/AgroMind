import { Languages } from "lucide-react";
import { SegmentedTabs } from "../components";
import { type Lang, LANGS, t, useLanguage } from ".";

/** EN | МК as tabs. Each label is written in its own language, so it reads right whichever language is on. */
export function LanguageTabs({ className = "" }: { className?: string }) {
  const [lang, setLang] = useLanguage();
  return (
    <SegmentedTabs<Lang> label={t("Language")} size="sm" value={lang} onChange={setLang} className={className}
      items={LANGS.map((l) => ({ id: l.id, label: <span title={l.name} lang={l.id}>{l.label}</span> }))} />
  );
}

/** One button that switches to the other language (where the bar is short of room). */
export function LanguageButton({ className = "" }: { className?: string }) {
  const [lang, setLang] = useLanguage();
  const other = LANGS.find((l) => l.id !== lang)!;
  return (
    <button type="button" onClick={() => setLang(other.id)} lang={other.id}
      aria-label={other.id === "mk" ? "Префрли на македонски" : "Switch to English"} title={other.name}
      className={`h-10 items-center gap-1 rounded-ctl px-2.5 text-[13px] font-bold text-mut hover:bg-glass-hi hover:text-tx ${className}`}>
      <Languages size={16} strokeWidth={1.75} className="text-lime" /> {other.label}
    </button>
  );
}

/** Tabs on wider screens, one button on phones (the landing page header). */
export function LanguageSwitch({ className = "" }: { className?: string }) {
  return (
    <>
      <LanguageTabs className={`hidden sm:flex ${className}`} />
      <LanguageButton className={`flex border border-line bg-glass-hi sm:hidden ${className}`} />
    </>
  );
}
