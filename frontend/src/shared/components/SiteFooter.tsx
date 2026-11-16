import { Code } from "lucide-react";
import type { ReactNode } from "react";
import { t } from "../i18n";

const REPO = "https://github.com/soggy8/AgroMind";

/**
 * The footer of the scrolling pages (landing, Overview): who made it, that the project is free and open source, and
 * that the AI runs on a free API key (so it can be slow under load). `children` adds page notes below.
 */
export function SiteFooter({ children, lead }: { children?: ReactNode; lead?: ReactNode }) {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-[1240px] space-y-8 px-5 py-12 lg:px-8">
        {lead}
        <div>
          <p className="text-[13px] font-bold uppercase tracking-[.14em] text-lime">{t("Made by")}</p>
          <p className="mt-2 text-[clamp(1.75rem,5vw,2.75rem)] font-extrabold leading-[1.05] tracking-[-.03em] text-tx">
            <a href="https://estada.dev" target="_blank" rel="noopener" className="underline decoration-line/80 decoration-1 underline-offset-[6px] transition-colors hover:text-lime hover:decoration-lime">Andrej Trendov</a><br />Kire Angelov<br />Kiril Cvetkov
          </p>
        </div>
        <div className="max-w-[62ch] space-y-3 text-[13px] leading-relaxed text-mut">
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
      </div>
    </footer>
  );
}
