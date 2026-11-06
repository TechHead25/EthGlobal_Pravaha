import { WifiOff } from "lucide-react";
import type { ChainRead } from "@/server/chain";
import { EmptyState } from "@/components/ui/primitives";

export function ChainUnavailable({ read }: { read: Extract<ChainRead<unknown>, { status: "unavailable" }> }) {
  return <EmptyState icon={WifiOff} title="On-chain data is unavailable" description={`${read.reason} Wallet actions are disabled until the network responds.`} />;
}
