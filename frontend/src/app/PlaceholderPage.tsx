import { Sprout } from "lucide-react";
import { Button, Glass, Skeleton } from "../shared/components";
import { useFarmChoice } from "./farm";
import { type Route, ROUTES } from "./route";
import { TopBar } from "./TopBar";
import { t } from "../shared/i18n";

/** Shown by a dashboard while the farm list loads, or when there is no farm yet to show. */
export function PlaceholderPage({ route, onNavigate }: { route: Route; onNavigate: (r: Route) => void }) {
  const { farms } = useFarmChoice();
  const label = ROUTES.find((r) => r.id === route)?.label ?? t("AgroMind");
  return (
    <div className="flex min-h-full flex-col">
      <TopBar route={route} onNavigate={onNavigate} />
      <main className="grid flex-1 place-items-center p-6">
        <h1 className="sr-only">{label}</h1>
        {farms === null ? (
          <Glass className="w-full max-w-md space-y-3 p-6" aria-busy="true" aria-label={t("Loading your farms")}>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </Glass>
        ) : (
          <Glass className="max-w-md p-6">
            <h2 className="flex items-center gap-2 text-[21px] font-bold tracking-[-.01em]">
              <Sprout size={20} strokeWidth={1.75} className="text-lime" /> {t("Add your first farm")}
            </h2>
            <p className="mt-2 text-sm leading-normal text-mut">
              {t("The {label} works on a farm and its fields. Create one in the farm profile: find it on the map, then draw a field.", { label })}
            </p>
            <Button variant="primary" className="mt-5" onClick={() => onNavigate("farm-profile")}>{t("Open farm profile")}</Button>
          </Glass>
        )}
      </main>
    </div>
  );
}
