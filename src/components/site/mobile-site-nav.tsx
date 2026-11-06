"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

export function MobileSiteNav({
  links,
  signedIn,
  tone,
}: {
  links: { href: string; label: string }[];
  signedIn: boolean;
  tone: "dark" | "light";
}) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  React.useEffect(() => setOpen(false), [pathname]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={tone === "dark" ? "ghost-dark" : "ghost"} size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent side="left" className="flex flex-col">
        <DialogTitle className="sr-only">Navigation</DialogTitle>
        <div className="border-b p-4">
          <Logo />
        </div>
        <nav aria-label="Mobile" className="flex flex-col p-2">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-md px-3 py-2.5 text-sm hover:bg-muted" onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto grid gap-2 border-t p-4">
          {signedIn ? (
            <Button asChild>
              <Link href="/app/dashboard">Open workspace</Link>
            </Button>
          ) : (
            <>
              <Button asChild>
                <Link href="/campaigns">Explore campaigns</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/auth/sign-in">Sign in</Link>
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
