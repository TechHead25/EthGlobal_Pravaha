import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-7 w-7", className)} aria-hidden>
      <defs>
        <linearGradient id="oa-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="hsl(166 70% 42%)" />
          <stop offset="1" stopColor="hsl(190 70% 40%)" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="hsl(224 52% 9%)" stroke="hsl(0 0% 100% / 0.14)" />
      <circle cx="16" cy="16" r="7.5" fill="none" stroke="url(#oa-g)" strokeWidth="2.6" />
      <path d="M12.6 16.2l2.4 2.4 4.6-4.9" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ tone = "light", className, href = "/" }: { tone?: "light" | "dark"; className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 rounded-md", className)} aria-label="OpenAid Protocol home">
      <LogoMark />
      <span className={cn("text-[0.95rem] font-semibold tracking-tight", tone === "dark" ? "text-white" : "text-foreground")}>
        OpenAid<span className={cn("font-normal", tone === "dark" ? "text-white/55" : "text-muted-foreground")}> Protocol</span>
      </span>
    </Link>
  );
}
