import { requirePrincipal } from "@/server/session";
import { DonorOverview } from "./_components/donor-overview";

export const metadata = { title: "Donor" };

export default async function DonorPage() {
  await requirePrincipal("donor:view", "/app/donor");
  return <DonorOverview />;
}
