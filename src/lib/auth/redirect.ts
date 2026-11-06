/**
 * Open-redirect protection. Only same-origin relative paths are allowed as post-auth
 * destinations. Anything else falls back to the given default.
 */
export function safeCallbackPath(raw: unknown, fallback = "/app/dashboard"): string {
  if (typeof raw !== "string") return fallback;
  let value = raw.trim();
  if (!value || value.length > 512) return fallback;

  // Decode once to catch encoded schemes / slashes ("%2F%2Fevil.com").
  try {
    value = decodeURIComponent(value);
  } catch {
    return fallback;
  }

  // Must be a single-slash rooted path: rejects "//host", "/\\host", "http:", "javascript:".
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  if (value.includes("\\")) return fallback;

  // Never bounce back into the auth pages themselves.
  if (value.startsWith("/auth/") || value.startsWith("/api/auth")) return fallback;

  // Normalize through URL against a dummy origin and verify the origin did not change.
  try {
    const u = new URL(value, "http://openaid.invalid");
    if (u.origin !== "http://openaid.invalid") return fallback;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}

/**
 * Auth.js `redirect` callback policy: allow relative URLs and absolute URLs on our own
 * origin; everything else goes to baseUrl.
 */
export function resolveAuthRedirect(url: string, baseUrl: string): string {
  if (url.startsWith("/")) {
    return `${baseUrl}${safeCallbackPath(url, "/app/dashboard")}`;
  }
  try {
    const target = new URL(url);
    const base = new URL(baseUrl);
    if (target.origin === base.origin) {
      return `${baseUrl}${safeCallbackPath(`${target.pathname}${target.search}${target.hash}`, "/app/dashboard")}`;
    }
  } catch {
    /* fall through */
  }
  return baseUrl;
}
