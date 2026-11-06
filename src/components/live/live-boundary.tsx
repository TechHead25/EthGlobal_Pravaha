import { getCampaigns, getEscrowEvents } from "@/server/chain";
import { EscrowLiveProvider } from "./escrow-live";

/**
 * Server boundary used by each role-section layout: reads the chain once and seeds the
 * shared live provider. Sibling pages in the section reuse the same live state.
 */
export async function LiveEscrowBoundary({ children }: { children: React.ReactNode }) {
  const [chain, events] = await Promise.all([getCampaigns(), getEscrowEvents(null)]);
  // Start polling from the OLDER of the two snapshots so no block is skipped; overlap is de-duplicated.
  const initialBlock =
    chain.status === "ok" ? (events.status === "ok" ? Math.min(chain.data.blockNumber, events.data.toBlock) : chain.data.blockNumber) : null;
  return (
    <EscrowLiveProvider
      initialCampaigns={chain.status === "ok" ? chain.data.campaigns : []}
      initialEvents={events.status === "ok" ? events.data.events : []}
      initialBlock={initialBlock}
      unavailableReason={chain.status === "ok" ? null : chain.reason}
      eventsAvailable={events.status === "ok"}
    >
      {children}
    </EscrowLiveProvider>
  );
}
