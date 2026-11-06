export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; issues?: { path: string; message: string }[] };

/** Same-origin JSON client for the private API. Cookies are sent automatically. */
export async function apiFetch<T>(path: string, init?: { method?: string; body?: unknown }): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as ApiResult<T> | null;
    if (!json) return { ok: false, code: "BAD_RESPONSE", message: `Unexpected response (${res.status}).` };
    return json;
  } catch {
    return { ok: false, code: "NETWORK", message: "Network error. Check your connection and try again." };
  }
}
