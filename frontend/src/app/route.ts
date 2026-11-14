import { useCallback, useEffect, useState } from "react";

export type Route = "command-center" | "simulator" | "farm-profile";
export const ROUTES: { id: Route; label: string }[] = [
  { id: "command-center", label: "Command Center" },
  { id: "simulator", label: "Simulator" },
  { id: "farm-profile", label: "Farm profile" },
];

const DEFAULT: Route = "simulator";

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
    window.location.hash = `/${r}`;
  }, []);
  return [route, navigate];
}
