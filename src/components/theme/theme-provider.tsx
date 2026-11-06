"use client";

import * as React from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "openaid-theme";

/**
 * Runs in <head> before first paint so the correct theme is applied without a flash.
 * Light is the default when nothing is stored. Kept tiny and dependency-free.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";}catch(_){}})();`;

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function readPreference(): ThemePreference {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return v === "dark" || v === "system" || v === "light" ? v : "light";
  } catch {
    return "light";
  }
}

function systemTheme(): ResolvedTheme {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(resolved: ResolvedTheme) {
  const el = document.documentElement;
  el.classList.toggle("dark", resolved === "dark");
  el.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = React.useState<ThemePreference>("light");
  const [resolved, setResolved] = React.useState<ResolvedTheme>("light");

  // Sync with whatever the init script already applied.
  React.useEffect(() => {
    const p = readPreference();
    setPreferenceState(p);
    setResolved(p === "system" ? systemTheme() : p);
  }, []);

  // Follow OS changes while in "system" mode.
  React.useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const r = mq.matches ? "dark" : "light";
      setResolved(r);
      apply(r);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  // Keep multiple tabs in sync.
  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      const p = readPreference();
      const r = p === "system" ? systemTheme() : p;
      setPreferenceState(p);
      setResolved(r);
      apply(r);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setPreference = React.useCallback((p: ThemePreference) => {
    const r = p === "system" ? systemTheme() : p;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, p);
    } catch {
      /* storage unavailable: still apply for this session */
    }
    setPreferenceState(p);
    setResolved(r);
    apply(r);
  }, []);

  const value = React.useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  // Safe fallback for components rendered outside the provider (e.g. isolated tests).
  return ctx ?? { preference: "light", resolved: "light", setPreference: () => undefined };
}
