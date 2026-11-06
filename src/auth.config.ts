import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { resolveAuthRedirect } from "@/lib/auth/redirect";

/**
 * Edge-safe Auth.js configuration (used by middleware). Contains no database access.
 *
 * Session strategy: encrypted JWT in an HTTP-only, SameSite=Lax, Secure (in production)
 * cookie. The token carries ONLY the internal user id (`uid`). Roles are always re-loaded
 * from the database on the server for each request, so a tampered or stale token can
 * never grant privileges. Google access/refresh tokens are never stored.
 */
export const authConfig = {
  pages: {
    signIn: "/auth/sign-in",
    error: "/auth/error",
  },
  session: { strategy: "jwt", maxAge: 60 * 60 * 8, updateAge: 60 * 30 },
  providers: [
    Google({
      // Reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET automatically.
      authorization: { params: { prompt: "select_account" } },
    }),
  ],
  callbacks: {
    redirect({ url, baseUrl }) {
      return resolveAuthRedirect(url, baseUrl);
    },
    session({ session, token }) {
      // Expose only the opaque internal id. No roles, no provider tokens.
      if (session.user && typeof token.uid === "string") {
        session.user.id = token.uid;
      }
      return session;
    },
  },
  trustHost: process.env.AUTH_TRUST_HOST === "true" || process.env.NODE_ENV !== "production",
} satisfies NextAuthConfig;
