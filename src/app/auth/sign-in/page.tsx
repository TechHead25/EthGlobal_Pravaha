import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Lock } from "lucide-react";
import { signIn } from "@/auth";
import { getAuthConfigStatus, describeAuthError } from "@/lib/auth/config-status";
import { safeCallbackPath } from "@/lib/auth/redirect";
import { getPrincipal } from "@/server/session";
import { SubmitButton } from "@/components/auth/submit-button";
import { GoogleIcon } from "@/components/auth/google-icon";
import { Notice } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: { callbackUrl?: string; error?: string } }) {
  const callbackUrl = safeCallbackPath(searchParams.callbackUrl);
  const status = getAuthConfigStatus();

  if (status.ready) {
    const principal = await getPrincipal().catch(() => null);
    if (principal) redirect(callbackUrl);
  }

  async function signInWithGoogle() {
    "use server";
    // Re-validate on the server; never trust the client-provided value.
    await signIn("google", { redirectTo: callbackUrl });
  }

  const err = searchParams.error ? describeAuthError(searchParams.error) : null;

  return (
    <div>
      <h1 className="font-display text-3xl tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">Use your Google account to access your OpenAid workspace.</p>

      {err ? (
        <Notice tone="error" icon={AlertTriangle} title={err.title} className="mt-6">
          {err.message}
        </Notice>
      ) : null}

      {status.ready ? (
        <form action={signInWithGoogle} className="mt-8">
          <SubmitButton size="lg" variant="outline" className="w-full bg-card" pendingLabel="Redirecting to Google…">
            <GoogleIcon className="h-5 w-5" />
            Continue with Google
          </SubmitButton>
        </form>
      ) : (
        <Notice tone="warning" icon={Lock} title="Google sign-in is not configured" className="mt-8">
          <p>This server is missing the following settings:</p>
          <ul className="mt-2 list-inside list-disc font-mono text-xs">
            {status.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <p className="mt-2">
            See <span className="font-mono text-xs">docs/AUTH_SETUP.md</span> to configure Google OAuth and the database. Sign-in is not
            simulated.
          </p>
        </Notice>
      )}

      <div className="mt-8 space-y-2 border-t pt-6 text-xs text-muted-foreground">
        <p>New accounts start as members. Donor, NGO, vendor and validator access is requested after sign-in and reviewed.</p>
        <p>
          Signing in does not connect a wallet or authorize any transaction. Read our{" "}
          <Link href="/about#privacy" className="underline">privacy notes</Link>.
        </p>
      </div>
      <Link href="/" className="mt-6 inline-block text-sm text-muted-foreground hover:text-foreground">
        ← Back to OpenAid
      </Link>
    </div>
  );
}
