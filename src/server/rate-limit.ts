/**
 * Fixed-window rate limiter keyed by caller identity + route.
 *
 * LIMITATION: state is per server instance (in-process memory). It throttles abuse on a
 * single node and in development, but a multi-instance deployment should back this with a
 * shared store (e.g. Redis / Upstash). It is a throttle, never an authorization control.
 */
interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();
const MAX_KEYS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  if (buckets.size > MAX_KEYS) {
    for (const [k, w] of buckets) if (w.resetAt <= now) buckets.delete(k);
    if (buckets.size > MAX_KEYS) buckets.clear();
  }
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  if (current.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
  }
  current.count += 1;
  return { allowed: true, remaining: limit - current.count, retryAfterSeconds: 0 };
}

export function resetRateLimits() {
  buckets.clear();
}

/** Best-effort client IP from proxy headers (only meaningful behind a trusted proxy). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim().slice(0, 64);
  return headers.get("x-real-ip")?.slice(0, 64) || "unknown";
}
