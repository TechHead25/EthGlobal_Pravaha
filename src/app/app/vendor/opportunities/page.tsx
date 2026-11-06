import { requirePrincipal } from "@/server/session";
import { VendorOpportunities } from "../_components/vendor-opportunities";

export const metadata = { title: "Opportunities" };

export default async function VendorOpportunitiesPage() {
  await requirePrincipal("vendor:view", "/app/vendor/opportunities");
  return <VendorOpportunities />;
}
