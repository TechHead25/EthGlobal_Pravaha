import { requirePrincipal } from "@/server/session";
import { VendorContracts } from "../_components/vendor-contracts";

export const metadata = { title: "Contracts & payments" };

export default async function VendorContractsPage() {
  await requirePrincipal("vendor:view", "/app/vendor/contracts");
  return <VendorContracts />;
}
