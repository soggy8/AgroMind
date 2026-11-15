import { Code } from "lucide-react";
import type { ReactNode } from "react";
import { t } from "../i18n";

const REPO = "https://github.com/soggy8/AgroMind";

/** "Powered by ESTADA": the studio's mark, linking to estada.dev (same mark as the blabla-cafe site). */
export function PoweredBy() {
  return (
    <a href="https://estada.dev" target="_blank" rel="noopener" aria-label={t("Powered by ESTADA")}
      className="group inline-flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[.16em] text-mut transition-colors hover:text-tx focus-visible:text-tx">
      <span>{t("Powered by")}</span>
      <span className="flex items-center gap-2.5 transition duration-200 group-hover:-translate-y-0.5 group-hover:brightness-125 group-focus-visible:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
        <img src="/estada-icon.svg" alt="" width={237} height={226} className="h-auto w-[26px]" />
        <img src="/estada-logo.svg" alt="" width={151} height={21} className="h-auto w-[130px]" />
      </span>
    </a>
  );
}

/**
 * The footer of the scrolling pages (landing, Overview): the project is free and open source, the AI runs on a free
 * API key (so it can be slow under load), and the Powered by ESTADA credit. `children` adds page notes above.
 */
export function SiteFooter({ children, lead }: { children?: ReactNode; lead?: ReactNode }) {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[1240px] gap-6 px-5 py-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-10 lg:px-8">
        <div className="space-y-3 text-[13px] leading-relaxed text-mut">
          {lead}
          <p>
            {t("AgroMind is a free, open-source project.")}{" "}
            <a href={REPO} target="_blank" rel="noopener"
              className="inline-flex items-center gap-1 font-semibold text-tx underline-offset-2 hover:underline">
              <Code size={14} strokeWidth={1.75} aria-hidden /> {t("See the code on GitHub")}
            </a>
          </p>
          <p>
            {t("All of AgroMind's AI features run on a free API key. If the assistant is slow or has to wait, it's because many people are using it at once.")}
          </p>
          {children}
        </div>
        <PoweredBy />
      </div>
    </footer>
  );
}
