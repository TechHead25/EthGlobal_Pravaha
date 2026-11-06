import { requirePrincipal } from "@/server/session";
import { LiveEscrowBoundary } from "@/components/live/live-boundary";

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  await requirePrincipal("vendor:view", "/app/vendor");
  return <LiveEscrowBoundary>{children}</LiveEscrowBoundary>;
}
