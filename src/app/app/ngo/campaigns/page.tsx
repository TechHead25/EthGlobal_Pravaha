import { requirePrincipal } from "@/server/session";
import { NgoCampaigns } from "../_components/ngo-campaigns";

export const metadata = { title: "Campaigns" };

export default async function NgoCampaignsPage() {
  await requirePrincipal("ngo:view", "/app/ngo/campaigns");
  return <NgoCampaigns timingMode={process.env.NEXT_PUBLIC_PROTOCOL_TIMING_MODE === "PRODUCTION" ? "PRODUCTION" : "DEMO"} />;
}
