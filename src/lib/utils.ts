import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

const DATE_ONLY = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** Consistent, timezone-explicit (UTC) date formatting so server and client render identically. */
export function formatDateTime(value: Date | string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const d = typeof value === "number" && value < 1e12 ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return "—";
  return DATE_TIME.format(d);
}

export function formatDate(value: Date | string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const d = typeof value === "number" && value < 1e12 ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return "—";
  return DATE_ONLY.format(d);
}

/** Format a bigint token amount with fixed decimals, without floating point loss. */
export function formatTokenAmount(amount: bigint | string, decimals = 6, maxFraction = 2): string {
  const value = typeof amount === "string" ? BigInt(amount) : amount;
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = abs % base;
  let fracStr = fraction.toString().padStart(decimals, "0").slice(0, maxFraction);
  fracStr = fracStr.replace(/0+$/, "");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${wholeStr}${fracStr ? `.${fracStr}` : ""}`;
}

export function shortAddress(address: string | null | undefined, chars = 4): string {
  if (!address) return "—";
  if (address.length <= 2 + chars * 2) return address;
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

export function percent(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  const bps = (part * 10000n) / whole;
  return Math.min(100, Number(bps) / 100);
}
