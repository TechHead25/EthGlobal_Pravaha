/**
 * Reports which server-side auth settings are present — names only, never values.
 */
export interface AuthConfigStatus {
  googleConfigured: boolean;
  secretConfigured: boolean;
  databaseConfigured: boolean;
  missing: string[];
  ready: boolean;
}

export function getAuthConfigStatus(env: Record<string, string | undefined> = process.env): AuthConfigStatus {
  const missing: string[] = [];
  const has = (k: string) => Boolean(env[k] && env[k]!.trim().length > 0);

  const secretConfigured = has("AUTH_SECRET") && env.AUTH_SECRET!.trim().length >= 32;
  if (!secretConfigured) missing.push("AUTH_SECRET");
  const googleId = has("AUTH_GOOGLE_ID") || has("GOOGLE_CLIENT_ID");
  const googleSecret = has("AUTH_GOOGLE_SECRET") || has("GOOGLE_CLIENT_SECRET");
  if (!googleId) missing.push("AUTH_GOOGLE_ID");
  if (!googleSecret) missing.push("AUTH_GOOGLE_SECRET");
  const databaseConfigured = has("DATABASE_URL") && /^postgres(ql)?:\/\//.test(env.DATABASE_URL!.trim());
  if (!databaseConfigured) missing.push("DATABASE_URL");

  const googleConfigured = googleId && googleSecret;
  return {
    googleConfigured,
    secretConfigured,
    databaseConfigured,
    missing,
    ready: googleConfigured && secretConfigured && databaseConfigured,
  };
}

/** Maps Auth.js error codes to safe, user-facing copy. Unknown codes get a generic message. */
export function describeAuthError(code: string | null | undefined): { title: string; message: string } {
  switch (code) {
    case "Configuration":
      return {
        title: "Sign-in is not configured",
        message: "The server is missing authentication configuration. An operator needs to complete the Google OAuth setup.",
      };
    case "AccessDenied":
      return {
        title: "Access denied",
        message: "Sign-in was declined. This happens if you cancelled at Google, your Google email is unverified, or your account is suspended.",
      };
    case "Verification":
      return { title: "Link expired", message: "The sign-in link is no longer valid. Please start again." };
    case "OAuthCallbackError":
    case "OAuthSignin":
    case "Callback":
      return { title: "Google sign-in did not complete", message: "The response from Google could not be verified. Please try again." };
    default:
      return { title: "Sign-in failed", message: "Something went wrong while signing you in. Please try again." };
  }
}
