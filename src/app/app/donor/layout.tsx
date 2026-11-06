import { requirePrincipal } from "@/server/session";
import { LiveEscrowBoundary } from "@/components/live/live-boundary";

/** Donor section: server-enforced permission + one shared live escrow state for all donor pages. */
export default async function DonorLayout({ children }: { children: React.ReactNode }) {
  await requirePrincipal("donor:view", "/app/donor");
  return <LiveEscrowBoundary>{children}</LiveEscrowBoundary>;
}
