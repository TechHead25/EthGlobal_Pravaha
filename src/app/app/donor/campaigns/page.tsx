import { requirePrincipal } from "@/server/session";
import { DonorDiscover } from "../_components/donor-discover";

export const metadata = { title: "Discover campaigns" };

export default async function DonorCampaignsPage({ searchParams }: { searchParams: { campaign?: string } }) {
  await requirePrincipal("donor:view", "/app/donor/campaigns");
  const focus = /^\d{1,9}$/.test(searchParams.campaign ?? "") ? Number(searchParams.campaign) : null;
  return <DonorDiscover focus={focus} />;
}
