import { requirePrincipal } from "@/server/session";
import { LiveEscrowBoundary } from "@/components/live/live-boundary";

export default async function NgoLayout({ children }: { children: React.ReactNode }) {
  await requirePrincipal("ngo:view", "/app/ngo");
  return <LiveEscrowBoundary>{children}</LiveEscrowBoundary>;
}
