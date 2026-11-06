import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { Principal } from "@/lib/auth/roles";
import type { ServiceResult } from "./authz-service";
import { getStore, isDatabaseConfigured } from "./db";
import { clientIp, rateLimit } from "./rate-limit";
import { getPrincipal } from "./session";
import type { AuthzStore } from "./store/types";

export const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
} as const;

export function json(body: unknown, status = 200, extra?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...PRIVATE_HEADERS, ...extra } });
}

export function toResponse<T>(result: ServiceResult<T>) {
  if (result.ok) return json({ ok: true, data: result.data }, result.status);
  return json({ ok: false, code: result.code, message: result.message, issues: result.issues }, result.status);
}

/**
 * CSRF defense in depth for cookie-authenticated mutations: the Origin header (sent by all
 * modern browsers on POST/PATCH/DELETE) must match this host. Session cookies are also
 * SameSite=Lax via Auth.js.
 */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function readJson(req: NextRequest): Promise<unknown> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return Symbol.for("invalid");
  const text = await req.text();
  if (text.length > 16_384) return Symbol.for("invalid");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return Symbol.for("invalid");
  }
}

type Handler = (ctx: { req: NextRequest; principal: Principal | null; store: AuthzStore; body: unknown }) => Promise<Response>;

/**
 * Standard wrapper for private API routes: DB check, CSRF origin check on mutations,
 * rate limiting, body parsing, principal resolution, and error masking.
 */
export function privateRoute(handler: Handler, opts: { rateLimit?: { limit: number; windowMs: number }; name: string }) {
  return async (req: NextRequest): Promise<Response> => {
    if (!isDatabaseConfigured()) {
      return json({ ok: false, code: "DATABASE_NOT_CONFIGURED", message: "Account services are not configured on this server." }, 503);
    }
    const mutating = req.method !== "GET" && req.method !== "HEAD";
    if (mutating && !isSameOrigin(req)) {
      return json({ ok: false, code: "CSRF_REJECTED", message: "Cross-origin request rejected." }, 403);
    }
    try {
      const principal = await getPrincipal();
      if (opts.rateLimit) {
        const who = principal?.id ?? `ip:${clientIp(req.headers)}`;
        const rl = rateLimit(`${opts.name}:${who}`, opts.rateLimit.limit, opts.rateLimit.windowMs);
        if (!rl.allowed) {
          return json({ ok: false, code: "RATE_LIMITED", message: "Too many requests. Try again shortly." }, 429, {
            "Retry-After": String(rl.retryAfterSeconds),
          });
        }
      }
      let body: unknown = undefined;
      if (mutating && req.method !== "DELETE") {
        body = await readJson(req);
        if (body === Symbol.for("invalid")) {
          return json({ ok: false, code: "INVALID_INPUT", message: "Expected a JSON body." }, 400);
        }
      }
      return await handler({ req, principal, store: getStore(), body });
    } catch (err) {
      // Log a minimal, non-sensitive marker; never echo internal errors to clients.
      console.error(`[api:${opts.name}] unhandled error:`, err instanceof Error ? err.name : "unknown");
      return json({ ok: false, code: "INTERNAL_ERROR", message: "Something went wrong." }, 500);
    }
  };
}
