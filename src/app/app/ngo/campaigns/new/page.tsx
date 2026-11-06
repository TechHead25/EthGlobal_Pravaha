import { requirePrincipal } from "@/server/session";
import { getStore } from "@/server/db";
import { NgoNewCampaign } from "../../_components/ngo-new-campaign";

export const metadata = { title: "New campaign" };

export default async function NgoNewCampaignPage() {
  const principal = await requirePrincipal("ngo:campaign_create", "/app/ngo/campaigns/new");
  const orgs = (await getStore().listOrganizations({ ownerId: principal.id, limit: 20 })).filter((o) => o.kind === "NGO");
  const org = orgs.find((o) => o.status === "VERIFIED") ?? orgs[0];
  return <NgoNewCampaign organizationName={org?.name ?? null} />;
}
