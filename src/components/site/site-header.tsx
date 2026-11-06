import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getPrincipal } from "@/server/session";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { MobileSiteNav } from "./mobile-site-nav";
import { SiteNavLinks } from "./site-nav-links";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export const SITE_LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/transparency", label: "Transparency" },
  { href: "/about", label: "About" },
];

export async function SiteHeader({ tone = "dark" }: { tone?: "dark" | "light" }) {
  let principal = null;
  try {
    principal = await getPrincipal();
  } catch {
    principal = null;
  }
  const dark = tone === "dark";
  return (
    <header
      className={
        dark
          ? "absolute inset-x-0 top-0 z-40 border-b border-white/[0.07]"
          : "sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md"
      }
    >
      <div className="container flex h-16 items-center justify-between gap-4">
        <Logo tone={dark ? "dark" : "light"} />
        <SiteNavLinks links={SITE_LINKS} tone={tone} />
        <div className="flex items-center gap-2">
          {principal ? (
            <Button asChild size="sm" variant={dark ? "light" : "default"} className="hidden sm:inline-flex">
              <Link href="/app/dashboard">
                Open workspace <ArrowRight aria-hidden />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant={dark ? "ghost-dark" : "ghost"} className="hidden sm:inline-flex">
                <Link href="/auth/sign-in">Sign in</Link>
              </Button>
              <Button asChild size="sm" variant={dark ? "light" : "default"} className="hidden sm:inline-flex">
                <Link href="/campaigns">Explore campaigns</Link>
              </Button>
            </>
          )}
          <ThemeToggle onInk={dark} />
          <MobileSiteNav links={SITE_LINKS} signedIn={Boolean(principal)} tone={tone} />
        </div>
      </div>
    </header>
  );
}
