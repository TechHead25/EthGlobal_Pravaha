import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "./auth.config";

/**
 * Coarse guard: unauthenticated visitors to /app/** are redirected to sign-in.
 * This is NOT the authorization boundary — every server component, route handler,
 * and service function re-checks the session and loads roles from the database.
 */
const { auth } = NextAuth(authConfig);

function toSignIn(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/auth/sign-in";
  url.search = `?callbackUrl=${encodeURIComponent(`${req.nextUrl.pathname}${req.nextUrl.search}`)}`;
  return NextResponse.redirect(url);
}

const guarded = auth((req) => {
  if (!req.auth?.user) return toSignIn(req);
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "private, no-store");
  return res;
});

export default function middleware(req: NextRequest, ctx: unknown) {
  // Without a secret no session can exist; send users to the sign-in page, which explains setup.
  if (!process.env.AUTH_SECRET) return toSignIn(req);
  return (guarded as unknown as (r: NextRequest, c: unknown) => Promise<Response>)(req, ctx);
}

export const config = {
  matcher: ["/app/:path*"],
};
