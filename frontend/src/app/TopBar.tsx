import { ChevronDown, Menu } from "lucide-react";
import type { ReactNode } from "react";
import { SegmentedTabs } from "../shared/components";
import { ROUTES, type Route } from "./route";

function Logo() {
  return (
    <div className="flex items-center gap-[9px] text-[19px] font-extrabold tracking-[-.01em]">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 21c0-7 3-12 9-15-1 8-4 13-9 15Z" fill="var(--color-lime)" />
        <path d="M12 21C12 15 9.5 10.5 3 8c.6 7 3.6 11.4 9 13Z" fill="var(--color-rain)" />
      </svg>
      AgroMind
    </div>
  );
}

/** Top bar (DESIGN.md section 5): logo, farm switcher, main nav, page actions. */
export function TopBar({ route, onNavigate, farmName, region, actions }: {
  route: Route;
  onNavigate: (r: Route) => void;
  farmName?: string;
  region?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="glass relative z-20 mx-4 mt-4 flex h-[60px] items-center gap-3 !rounded-bar pl-4 pr-2.5 lg:mx-5 lg:gap-[18px] lg:pl-5">
      <Logo />
      {farmName && (
        <button type="button" title="Farm switcher: one demo farm for now"
          className="hidden items-center gap-2 whitespace-nowrap rounded-ctl border border-line bg-glass-hi px-3 py-2 text-sm font-semibold sm:flex">
          {farmName} <span className="hidden font-medium text-mut xl:inline">{region}</span>
          <ChevronDown size={14} strokeWidth={1.75} className="text-mut" />
        </button>
      )}
      <nav className="mx-auto hidden md:block" aria-label="Main">
        <SegmentedTabs label="Main navigation" items={ROUTES} value={route} onChange={onNavigate} />
      </nav>
      <div className="ml-auto flex items-center gap-2 md:ml-0">{actions}</div>
      <details className="relative md:hidden">
        <summary className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-ctl border border-line bg-glass-hi" aria-label="Menu">
          <Menu size={18} strokeWidth={1.75} />
        </summary>
        <div className="glass absolute right-0 top-14 w-52 p-2">
          {ROUTES.map((r) => (
            <button key={r.id} type="button" onClick={() => onNavigate(r.id)}
              className={`block w-full rounded-ctl px-3 py-3 text-left text-sm font-semibold ${r.id === route ? "bg-glass-sel" : "text-mut"}`}>
              {r.label}
            </button>
          ))}
        </div>
      </details>
    </header>
  );
}
