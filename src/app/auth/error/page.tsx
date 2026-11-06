import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { describeAuthError } from "@/lib/auth/config-status";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Sign-in problem", robots: { index: false } };

/** Auth.js error page. Only a known error code is read; nothing from the URL is reflected verbatim. */
export default function AuthErrorPage({ searchParams }: { searchParams: { error?: string } }) {
  const { title, message } = describeAuthError(typeof searchParams.error === "string" ? searchParams.error : null);
  return (
    <div>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive-soft text-destructive">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </div>
      <h1 className="mt-4 font-display text-3xl tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <div className="mt-8 flex gap-3">
        <Button asChild>
          <Link href="/auth/sign-in">Try again</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}
