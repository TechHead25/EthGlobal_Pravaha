"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function SiteNavLinks({ links, tone }: { links: { href: string; label: string }[]; tone: "dark" | "light" }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
      {links.map((l) => {
        const active = !l.href.includes("#") && (pathname === l.href || pathname.startsWith(`${l.href}/`));
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 text-sm transition-colors",
              tone === "dark"
                ? cn("text-white/70 hover:text-white", active && "text-white")
                : cn("text-muted-foreground hover:text-foreground", active && "font-medium text-foreground")
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
