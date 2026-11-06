import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { PageHero } from "@/components/site/page-hero";
import { EmptyState, Notice } from "@/components/ui/primitives";
import { getCampaigns } from "@/server/chain";
import { formatDateTime, formatTokenAmount } from "@/lib/utils";
import { CampaignExplorer } from "@/components/dashboard/campaign-explorer";

export const metadata: Metadata = { title: "Campaigns" };

const STATUS_KEYS = ["funding", "procurement", "delivery", "settlement", "refunds"];

export default async function CampaignsPage({ searchParams }: { searchParams: { status?: string } }) {
  const chain = await getCampaigns();
  const initialStatus = searchParams.status && STATUS_KEYS.includes(searchParams.status) ? searchParams.status : "all";

  return (
    <main id="main">
      <SiteHeader tone="light" />
      <PageHero
        eyebrow="Campaign discovery"
        title="Campaigns on the escrow"
        description="Read directly from OpenAidEscrow on Arc Testnet. Titles and organization names come from IPFS metadata submitted by the campaign creator and are labeled as self-declared."
      >
        {chain.status === "ok" ? (
          <dl className="flex flex-wrap gap-x-10 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Campaigns</dt>
              <dd className="font-display text-2xl">{chain.data.campaignCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Escrow balance</dt>
              <dd className="font-display text-2xl">{formatTokenAmount(BigInt(chain.data.escrowBalance))} USDC</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Read at</dt>
              <dd className="pt-2 text-sm">{formatDateTime(chain.readAt)}</dd>
            </div>
          </dl>
        ) : null}
      </PageHero>
      <div className="container py-12">
        {chain.status !== "ok" ? (
          <EmptyState icon={WifiOff} title="Arc Testnet is unreachable" description={chain.reason} />
        ) : (
          <CampaignExplorer campaigns={chain.data.campaigns} initialStatus={initialStatus} />
        )}
        {chain.status === "ok" && chain.data.campaignCount > chain.data.campaigns.length ? (
          <Notice tone="info" className="mt-6">
            Showing the {chain.data.campaigns.length} most recent of {chain.data.campaignCount} campaigns.
          </Notice>
        ) : null}
      </div>
    </main>
  );
}
