import { useCallback, useEffect, useState } from "react";
import { cropdoctorApi } from "../api/cropdoctorApi";
import type { FarmHealth } from "../types";
import { t } from "../../../shared/i18n";

/**
 * Farm health for a date. `asOf` null asks the API for its default (the 2012 replay on the demo farm).
 * The last response stays on screen while the next one loads. The selected field defaults to the
 * first field with a finding, otherwise the first field, until the user picks one.
 */
export function useHealth(farmId: string) {
  const [health, setHealth] = useState<FarmHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asOf, setAsOfState] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    cropdoctorApi.getHealth(farmId, asOf ?? undefined, ctrl.signal)
      .then((h) => { setHealth(h); setLoading(false); })
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        setError(e.message || t("Couldn't load the farm's health."));
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [farmId, asOf, attempt]);

  const fields = health?.fields ?? [];
  const fallback = fields.find((f) => health?.findings.some((x) => x.field_id === f.id))?.id ?? fields[0]?.id ?? null;
  const fieldId = picked && fields.some((f) => f.id === picked) ? picked : fallback;

  const setAsOf = useCallback((d: string | null) => setAsOfState(d), []);
  const selectField = useCallback((id: string) => setPicked(id), []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { health, loading, error, asOf, setAsOf, fieldId, selectField, retry };
}
