/**
 * CropTwin's HTTP client for /api/farms (backend/app/modules/croptwin/router.py). Owned by CropTwin.
 * Used by state/useFarms.ts, state/useFarmProfile.ts, WeatherCard, and the page's place search and NASA value lookup.
 * Request and response shapes are in ../types.ts, which mirrors backend schemas.py: change both together.
 */
import { ApiError, http } from "../../../shared/api/http";
import { acceptLanguage } from "../../../shared/i18n";
import type {
  AdvisorContext, ColourReading, CropHistoryIn, FarmCreate, FarmOut, FarmSummary, FarmUpdate, FieldCreate, FieldOut, FieldUpdate, PlaceSearch,
  SoilLayerIn, WeatherOut,
} from "../types";
import { t } from "../../../shared/i18n";

/**
 * PATCH and PUT, which shared/api/http.ts doesn't have yet. Same error handling as http.ts;
 * drop this once the shared client grows `patch` and `put`.
 */
async function send<T>(method: "PATCH" | "PUT", path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method, headers: { "Content-Type": "application/json", "Accept-Language": acceptLanguage() }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError(0, t("Couldn't reach the AgroMind server. Check that the backend is running."));
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = typeof data.detail === "string" ? data.detail : (data.detail?.[0]?.msg ?? detail);
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

const farm = (farmId: string) => `/api/farms/${encodeURIComponent(farmId)}`;
const field = (farmId: string, fieldId: string) => `${farm(farmId)}/fields/${encodeURIComponent(fieldId)}`;

/** Typed calls to /api/farms. A failed request rejects with ApiError (HTTP status plus the API's message). */
export const croptwinApi = {
  listFarms: (signal?: AbortSignal) => http.get<FarmSummary[]>("/api/farms", signal),
  /** Place names via our backend (Nominatim, within its usage policy). Call only on an explicit search. */
  searchPlaces: (q: string, signal?: AbortSignal) =>
    http.get<PlaceSearch>(`/api/farms/places?q=${encodeURIComponent(q)}&lang=${encodeURIComponent(navigator.language)}`, signal),
  createFarm: (body: FarmCreate) => http.post<FarmOut>("/api/farms", body),
  deleteFarm: (farmId: string) => http.del(farm(farmId)),
  /** NASA's value class for a GIBS pixel colour. */
  nasaColour: (colormap: string, c: { r: number; g: number; b: number; a: number }, signal?: AbortSignal) =>
    http.get<ColourReading>(`/api/farms/nasa-colour?colormap=${encodeURIComponent(colormap)}&r=${c.r}&g=${c.g}&b=${c.b}&a=${c.a}`, signal),
  fieldWeather: (farmId: string, fieldId: string, signal?: AbortSignal) =>
    http.get<WeatherOut>(`${field(farmId, fieldId)}/weather`, signal),
  getFarm: (farmId: string, signal?: AbortSignal) => http.get<FarmOut>(farm(farmId), signal),
  /** The facts the AI advisor may use, built by the backend from the saved farm profile. */
  advisorContext: (farmId: string, signal?: AbortSignal) => http.get<AdvisorContext>(`${farm(farmId)}/advisor-context`, signal),
  updateFarm: (farmId: string, body: FarmUpdate) => send<FarmOut>("PATCH", farm(farmId), body),
  createField: (farmId: string, body: FieldCreate) => http.post<FieldOut>(`${farm(farmId)}/fields`, body),
  deleteField: (farmId: string, fieldId: string) => http.del(field(farmId, fieldId)),
  updateField: (farmId: string, fieldId: string, body: FieldUpdate) =>
    send<FieldOut>("PATCH", field(farmId, fieldId), body),
  replaceSoil: (farmId: string, fieldId: string, layers: SoilLayerIn[]) =>
    send<FieldOut>("PUT", `${field(farmId, fieldId)}/soil`, layers),
  prefillSoil: (farmId: string, fieldId: string) =>
    http.post<FieldOut>(`${field(farmId, fieldId)}/soil/prefill`, undefined),
  addCropHistory: (farmId: string, fieldId: string, entry: CropHistoryIn) =>
    http.post<FieldOut>(`${field(farmId, fieldId)}/crop-history`, entry),
  deleteCropHistory: (farmId: string, fieldId: string, entryId: string) =>
    http.del(`${field(farmId, fieldId)}/crop-history/${encodeURIComponent(entryId)}`),
};
