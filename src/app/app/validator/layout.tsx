import { requirePrincipal } from "@/server/session";
import { LiveEscrowBoundary } from "@/components/live/live-boundary";

export default async function ValidatorLayout({ children }: { children: React.ReactNode }) {
  await requirePrincipal("validator:view", "/app/validator");
  return <LiveEscrowBoundary>{children}</LiveEscrowBoundary>;
}
