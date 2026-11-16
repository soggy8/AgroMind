import { Check, ChevronDown, CircleHelp, Languages, LogIn, LogOut, Menu, MessageSquareText, Settings2, UserRound } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { Button, SegmentedTabs } from "../shared/components";
import { type UnitSystem, useUnits } from "../shared/units";
import { useOptionalAssistant } from "../shared/assistant/AssistantProvider";
import { LanguageTabs } from "../shared/i18n/LanguageSwitch";
import { useAuth } from "./auth";
import { useFarmChoice } from "./farm";
import { ROUTES, type Route } from "./route";
import { getLang, t, tn } from "../shared/i18n";

function Logo() {
  return (
    <a href="#/" aria-label={t("AgroMind home")} className="flex shrink-0 items-center gap-[9px] text-[19px] font-extrabold tracking-[-.01em] text-tx">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 21c0-7 3-12 9-15-1 8-4 13-9 15Z" fill="var(--color-lime)" />
        <path d="M12 21C12 15 9.5 10.5 3 8c.6 7 3.6 11.4 9 13Z" fill="var(--color-rain)" />
      </svg>
      <span className="max-sm:sr-only">{t("AgroMind")}</span>
    </a>
  );
}

/** A <details> popover that closes on outside click, Escape, or when `close()` is called. */
function usePopover() {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return { ref, close: () => { if (ref.current) ref.current.open = false; } };
}

/** The open farm's list, shared by the desktop switcher and the phone menu. */
function FarmList({ onPick, onManage }: { onPick: (id: string) => void; onManage: () => void }) {
  const { farms, selectedId } = useFarmChoice();
  return (
    <div>
      <p className="px-3 pb-1 pt-2 text-[12px] font-semibold uppercase tracking-[.06em] text-mut">{t("Farms")}</p>
      {(farms ?? []).length === 0 && <p className="px-3 py-2 text-[13px] text-mut">{t("No farms yet.")}</p>}
      <ul role="list">
        {(farms ?? []).map((f) => (
          <li key={f.id}>
            <button type="button" onClick={() => onPick(f.id)} aria-current={f.id === selectedId ? "true" : undefined}
              className={`flex min-h-11 w-full items-center gap-2 rounded-ctl px-3 py-2 text-left hover:bg-glass-hi ${f.id === selectedId ? "bg-glass-sel" : ""}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{f.name}</span>
                <span className="block truncate text-[12px] text-mut">
                  {[f.region, tn(f.field_count, "{n} field", "{n} fields")].filter(Boolean).join(" · ")}
                </span>
              </span>
              {f.id === selectedId && <Check size={16} strokeWidth={2} className="shrink-0 text-lime" aria-hidden />}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onManage}
        className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-ctl border-t border-line px-3 py-2 text-left text-sm font-semibold text-mut hover:bg-glass-hi hover:text-tx">
        <Settings2 size={15} strokeWidth={1.75} /> {t("Add or edit farms")}
      </button>
    </div>
  );
}

/** Sign in, or the signed-in account with Sign out. Visitors can still open the read-only demo farm. */
function Account() {
  const { user, loading, openAuth, signOut } = useAuth();
  const pop = usePopover();
  if (loading) return null;
  if (!user) {
    return (
      <button type="button" onClick={() => openAuth({ mode: "signin" })} aria-label={t("Sign in")}
        className="flex h-10 items-center gap-2 whitespace-nowrap rounded-ctl px-2.5 text-sm font-medium text-mut transition-colors hover:bg-glass-hi hover:text-tx">
        <LogIn size={17} strokeWidth={1.5} /> <span className="hidden xl:inline">{t("Sign in")}</span>
      </button>
    );
  }
  return (
    <details ref={pop.ref} className="relative">
      <summary aria-label={t("Account: {email}", { email: user.email })} title={user.email}
        className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-ctl text-mut transition-colors hover:bg-glass-hi hover:text-tx [&::-webkit-details-marker]:hidden">
        <UserRound size={18} strokeWidth={1.5} />
      </summary>
      <div className="glass absolute right-0 top-12 z-30 w-64 p-1.5">
        <p className="px-3 pb-1 pt-2 text-[12px] text-mut">{t("Signed in as")}</p>
        <p className="truncate px-3 pb-2 text-sm font-medium">{user.email}</p>
        <button type="button" onClick={() => { pop.close(); void signOut(); }}
          className="flex min-h-11 w-full items-center gap-2 rounded-ctl border-t border-line px-3 py-2 text-left text-sm font-medium text-mut hover:bg-glass-hi hover:text-tx">
          <LogOut size={15} strokeWidth={1.5} /> {t("Sign out")}
        </button>
      </div>
    </details>
  );
}

/** The phone menu's account row. */
function MenuAccount({ onDone }: { onDone: () => void }) {
  const { user, loading, openAuth, signOut } = useAuth();
  if (loading) return null;
  return (
    <div className="mt-1 border-t border-line px-1 pt-1">
      {user ? (
        <>
          <p className="truncate px-2 pt-2 text-[12px] text-mut">{t("Signed in as {email}", { email: user.email })}</p>
          <button type="button" onClick={() => { onDone(); void signOut(); }}
            className="flex min-h-11 w-full items-center gap-2 rounded-ctl px-2 py-2 text-left text-sm font-medium text-mut hover:bg-glass-hi hover:text-tx">
            <LogOut size={15} strokeWidth={1.5} /> {t("Sign out")}
          </button>
        </>
      ) : (
        <button type="button" onClick={() => { onDone(); openAuth({ mode: "signin" }); }}
          className="flex min-h-11 w-full items-center gap-2 rounded-ctl px-2 py-2 text-left text-sm font-medium hover:bg-glass-hi">
          <LogIn size={15} strokeWidth={1.5} /> {t("Sign in or create an account")}
        </button>
      )}
    </div>
  );
}

function UnitsToggle({ className = "" }: { className?: string }) {
  const u = useUnits();
  return (
    <SegmentedTabs<UnitSystem> label={t("Units")} size="sm" value={u.system} onChange={u.setSystem} className={className}
      items={[{ id: "metric", label: t("Metric") }, { id: "us", label: "US" }]} />
  );
}

/**
 * Top bar (DESIGN.md section 5), the same on every dashboard: logo · farm switcher · main nav · the page's status and
 * controls · units · help · Ask the advisor. Below 768 px the nav, farm list and units move into the menu.
 */
export function TopBar({ route, onNavigate, status, actions, onHelp, onAdvisor, onSwitchFarm, farmOverride }: {
  route: Route;
  onNavigate: (r: Route) => void;
  /** A short status pill for this page (shown on every screen size), e.g. "1 finding" or "Unsaved changes". */
  status?: ReactNode;
  /** Extra page controls, shown on large screens only. */
  actions?: ReactNode;
  /** Opens this page's guided tour. */
  onHelp?: () => void;
  /** Opens the advisor where there is no assistant (the assistant, shared/assistant, takes precedence). */
  onAdvisor?: () => void;
  /** How this page switches farms (default: switch straight away). Farm profile asks about unsaved changes first. */
  onSwitchFarm?: (id: string) => void;
  /** Shown instead of the open farm, e.g. "New farm" while one is being created. */
  farmOverride?: { name: string; region?: string | null };
}) {
  const { farms, selectedId, select } = useFarmChoice();
  const assistant = useOptionalAssistant();
  const openAdvisor = assistant ? assistant.summon : onAdvisor;
  const open = farms?.find((f) => f.id === selectedId);
  const farm = farmOverride ?? (open ? { name: open.name, region: open.region } : null);
  const switcher = usePopover();
  const menu = usePopover();
  const settings = usePopover();
  const pick = (id: string) => {
    switcher.close();
    menu.close();
    if (id !== selectedId) (onSwitchFarm ?? select)(id);
  };
  const manage = () => {
    switcher.close();
    menu.close();
    onNavigate("farm-profile");
  };

  return (
    <header className="glass relative z-20 mx-4 mt-4 flex h-[60px] min-w-0 items-center gap-2 !rounded-bar pl-4 pr-2.5 lg:mx-5 lg:gap-3 lg:pl-5">
      <Logo />
      {farm && (
        <details ref={switcher.ref} className="relative hidden sm:block">
          <summary aria-label={t("Farm: {name}. Switch farm", { name: farm.name })}
            className="flex max-w-[300px] cursor-pointer list-none items-center gap-2 whitespace-nowrap rounded-ctl border border-line bg-glass-hi px-3 py-2 text-sm font-semibold hover:bg-glass-sel [&::-webkit-details-marker]:hidden">
            <span className="truncate">{farm.name}</span>
            {farm.region && <span className="hidden truncate font-medium text-mut 2xl:inline">{farm.region}</span>}
            <ChevronDown size={14} strokeWidth={1.75} className="shrink-0 text-mut" />
          </summary>
          <div className="glass absolute left-0 top-12 z-30 w-72 p-1.5">
            <FarmList onPick={pick} onManage={manage} />
          </div>
        </details>
      )}
      <nav className="mx-auto hidden md:block" aria-label={t("Main")}>
        <SegmentedTabs label={t("Main navigation")} items={ROUTES} value={route === "home" ? "command-center" : route} onChange={onNavigate} />
      </nav>
      <div className="ml-auto flex min-w-0 items-center gap-2 md:ml-0">
        {status && <div className="shrink-0">{status}</div>}
        {actions && <div className="hidden items-center gap-2 lg:flex">{actions}</div>}
        {/* Language: tabs on very wide screens; from 768 px in the language-and-units popover; on phones in the menu. */}
        <LanguageTabs className="hidden 2xl:flex" />
        <UnitsToggle className="hidden 2xl:flex" />
        {onHelp && (
          <button type="button" onClick={onHelp} aria-label={t("Take the tour")} title={t("Take the tour")}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-ctl text-mut hover:bg-glass-hi hover:text-tx">
            <CircleHelp size={18} strokeWidth={1.75} />
          </button>
        )}
        {openAdvisor && (
          <Button onClick={openAdvisor} aria-label={t("Ask the advisor")} title={t("Ask the advisor (Ctrl+K)")} data-tour="advisor" className="shrink-0 max-sm:h-11 max-sm:w-11 max-sm:!px-0">
            <MessageSquareText size={16} strokeWidth={1.75} />
            {/* The label shows where the bar has room for it; the icon and Ctrl+K work everywhere. */}
            <span className="hidden whitespace-nowrap 2xl:inline">{t("Ask the advisor")}</span>
          </Button>
        )}
        {/* Language and units live here between 768 and 1536 px (so the bar fits); below 768 px they are in the menu. */}
        <details ref={settings.ref} className="relative hidden md:block 2xl:hidden">
          <summary aria-label={t("Display settings")} title={t("Language and units")}
            className="flex h-10 cursor-pointer list-none items-center gap-1 rounded-ctl px-2 text-[13px] font-bold text-mut hover:bg-glass-hi hover:text-tx [&::-webkit-details-marker]:hidden">
            <Languages size={17} strokeWidth={1.75} className="text-lime" />
            <span aria-hidden>{getLang() === "mk" ? "МК" : "EN"}</span>
          </summary>
          <div className="glass absolute right-0 top-12 z-30 space-y-2 p-2">
            <p className="px-1 text-[12px] font-semibold uppercase tracking-[.06em] text-mut">{t("Language")}</p>
            <LanguageTabs />
            <p className="px-1 pt-1 text-[12px] font-semibold uppercase tracking-[.06em] text-mut">{t("Units")}</p>
            <UnitsToggle />
          </div>
        </details>
        <div className="hidden md:block"><Account /></div>
      </div>
      <details ref={menu.ref} className="relative shrink-0 md:hidden">
        <summary className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-ctl border border-line bg-glass-hi [&::-webkit-details-marker]:hidden" aria-label={t("Menu")}>
          <Menu size={18} strokeWidth={1.75} />
        </summary>
        <div className="glass !bg-ground absolute right-0 top-14 z-30 max-h-[calc(100svh-90px)] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto p-1.5">
          <nav aria-label={t("Main")}>
            {ROUTES.map((r) => (
              <button key={r.id} type="button" onClick={() => { menu.close(); onNavigate(r.id); }}
                aria-current={r.id === route ? "page" : undefined}
                className={`block min-h-11 w-full rounded-ctl px-3 py-3 text-left text-sm font-semibold ${r.id === route ? "bg-glass-sel" : "text-mut"}`}>
                {t(r.label)}
              </button>
            ))}
          </nav>
          <div className="mt-1 border-t border-line pt-1">
            <FarmList onPick={pick} onManage={manage} />
          </div>
          <MenuAccount onDone={menu.close} />
          <div className="mt-1 space-y-2.5 border-t border-line px-3 py-2.5">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[.06em] text-mut">{t("Units")}</p>
              <UnitsToggle className="mt-1 w-full" />
            </div>
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[.06em] text-mut">{t("Language")}</p>
              <LanguageTabs className="mt-1 w-full" />
            </div>
          </div>
        </div>
      </details>
    </header>
  );
}
