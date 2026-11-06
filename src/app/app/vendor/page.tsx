import { requirePrincipal } from "@/server/session";
import { getStore } from "@/server/db";
import { VendorOverview } from "./_components/vendor-overview";

export const metadata = { title: "Vendor" };

export default async function VendorPage() {
  const principal = await requirePrincipal("vendor:view", "/app/vendor");
  const orgs = (await getStore().listOrganizations({ ownerId: principal.id, limit: 20 })).filter((o) => o.kind === "VENDOR");
  const org = orgs.find((o) => o.status === "VERIFIED") ?? orgs[0];
  return <VendorOverview org={{ name: org?.name ?? null, verified: org?.status === "VERIFIED" }} />;
}
