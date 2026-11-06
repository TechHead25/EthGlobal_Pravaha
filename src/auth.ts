import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { getStore, isDatabaseConfigured } from "@/server/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return false;
      // Require a Google-verified email; otherwise account takeover via unverified emails is possible.
      if (!profile?.email || profile.email_verified !== true || !profile.sub) return false;
      if (!isDatabaseConfigured()) return false;
      return true;
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === "google" && profile?.sub && profile.email) {
        const store = getStore();
        const user = await store.upsertGoogleUser({
          googleSub: profile.sub,
          email: profile.email.toLowerCase(),
          name: typeof profile.name === "string" ? profile.name : null,
          image: typeof profile.picture === "string" ? profile.picture : null,
        });
        if (user.status !== "ACTIVE") {
          await store.recordAudit({ actorId: user.id, action: "auth.sign_in_blocked", targetType: "User", targetId: user.id, metadata: { reason: "suspended" } });
          // Throwing aborts sign-in; Auth.js surfaces it as an AccessDenied-style error.
          throw new Error("AccountSuspended");
        }
        await store.recordAudit({ actorId: user.id, action: "auth.sign_in", targetType: "User", targetId: user.id, metadata: { provider: "google" } });
        token.uid = user.id;
        // Never persist provider tokens.
        delete (token as Record<string, unknown>).access_token;
        delete (token as Record<string, unknown>).refresh_token;
      }
      return token;
    },
  },
});
