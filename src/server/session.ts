import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { can, type Permission, type Principal } from "@/lib/auth/roles";
import { getStore, isDatabaseConfigured } from "./db";

/**
 * Resolve the current Principal from the session cookie + database.
 * Roles/status come ONLY from the database; the cookie only identifies the user.
 * Memoized per request.
 */
export const getPrincipal = cache(async (): Promise<Principal | null> => {
  if (!process.env.AUTH_SECRET || !isDatabaseConfigured()) return null;
  let session;
  try {
    session = await auth();
  } catch {
    return null;
  }
  const uid = session?.user?.id;
  if (!uid) return null;
  const user = await getStore().getUserWithRoles(uid);
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    status: user.status,
    roles: user.roles,
    worldIdVerifiedAt: user.worldIdVerifiedAt,
  };
});

/** For server components under /app. Redirects instead of rendering for unauthorized users. */
export async function requirePrincipal(permission: Permission = "dashboard:view", returnTo = "/app/dashboard"): Promise<Principal> {
  const principal = await getPrincipal();
  if (!principal) redirect(`/auth/sign-in?callbackUrl=${encodeURIComponent(returnTo)}`);
  if (principal.status !== "ACTIVE") redirect("/auth/error?error=AccessDenied");
  if (!can(principal, permission)) redirect(`/app/forbidden?need=${encodeURIComponent(permission)}`);
  return principal;
}
