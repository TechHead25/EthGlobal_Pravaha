import { requirePrincipal } from "@/server/session";
import { getStore } from "@/server/db";
import { NgoOverview } from "./_components/ngo-overview";

export const metadata = { title: "NGO" };

export default async function NgoPage() {
  const principal = await requirePrincipal("ngo:view", "/app/ngo");
  const orgs = (await getStore().listOrganizations({ ownerId: principal.id, limit: 20 })).filter((o) => o.kind === "NGO");
  const verified = orgs.find((o) => o.status === "VERIFIED");
  return <NgoOverview org={{ name: verified?.name ?? orgs[0]?.name ?? null, verified: Boolean(verified) }} />;
}
