import { requirePrincipal } from "@/server/session";
import { VendorBids } from "../_components/vendor-bids";

export const metadata = { title: "My bids" };

export default async function VendorBidsPage() {
  await requirePrincipal("vendor:view", "/app/vendor/bids");
  return <VendorBids />;
}
