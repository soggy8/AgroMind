import { useCallback, useEffect, useState } from "react";
import { t } from "../shared/i18n";

/** "home" is the landing page; it is not one of the app tabs in ROUTES. */
export type Route = "home" | AppRoute;
export type AppRoute = "overview" | "command-center" | "simulator" | "economics" | "farm-profile";
export const ROUTES: { id: AppRoute; label: string }[] = [
  { id: "overview", label: t("Overview") },
  { id: "command-center", label: t("Command Center") },
  { id: "simulator", label: t("Simulator") },
  { id: "economics", label: t("Farm money") },
  { id: "farm-profile", label: t("Farm profile") },
];

const DEFAULT: Route = "home";

function parse(): Route {
  const id = window.location.hash.replace(/^#\/?/, "");
  return ROUTES.some((r) => r.id === id) ? (id as Route) : DEFAULT;
}

/** Hash routing, enough for three top-level pages. Swap for a router if the app grows. */
export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const navigate = useCallback((r: Route) => {
    window.location.hash = r === "home" ? "/" : `/${r}`;
    window.scrollTo(0, 0);
  }, []);
  return [route, navigate];
}
