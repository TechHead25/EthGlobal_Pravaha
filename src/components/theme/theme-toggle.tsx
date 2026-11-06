"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTheme, type ThemePreference } from "./theme-provider";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Light / Dark / System switcher. `onInk` styles it for the always-dark navy bands. */
export function ThemeToggle({ onInk = false, className }: { onInk?: boolean; className?: string }) {
  const { preference, resolved, setPreference } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={onInk ? "ghost-dark" : "ghost"} size="icon" className={cn("relative", className)} aria-label={`Theme: ${preference}. Change theme`}>
          <Sun className={cn("h-[18px] w-[18px] transition-all", resolved === "dark" ? "scale-0 -rotate-90" : "scale-100 rotate-0")} aria-hidden />
          <Moon className={cn("absolute h-[18px] w-[18px] transition-all", resolved === "dark" ? "scale-100 rotate-0" : "scale-0 rotate-90")} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[9.5rem]">
        {OPTIONS.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => setPreference(o.value)} aria-checked={preference === o.value} role="menuitemradio">
            <o.icon aria-hidden />
            <span className="flex-1">{o.label}</span>
            {preference === o.value ? <Check className="!text-foreground" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
