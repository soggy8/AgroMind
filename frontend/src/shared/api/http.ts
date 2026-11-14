/** Minimal JSON client for the AgroMind API. Paths start with /api (proxied by Vite in dev). */

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      signal,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Couldn't reach the AgroMind server. Check that the backend is running.");
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
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const http = {
  get: <T,>(path: string, signal?: AbortSignal) => request<T>("GET", path, undefined, signal),
  post: <T,>(path: string, body: unknown, signal?: AbortSignal) => request<T>("POST", path, body, signal),
  del: (path: string) => request<void>("DELETE", path),
};
