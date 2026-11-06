import { requirePrincipal } from "@/server/session";
import { DonorDonations } from "../_components/donor-donations";

export const metadata = { title: "My donations" };

export default async function DonorDonationsPage() {
  await requirePrincipal("donor:view", "/app/donor/donations");
  return <DonorDonations />;
}
