import { requirePrincipal } from "@/server/session";
import { getStore } from "@/server/db";
import { VendorProfile } from "../_components/vendor-profile";

export const metadata = { title: "Vendor profile" };

export default async function VendorProfilePage() {
  const principal = await requirePrincipal("vendor:view", "/app/vendor/profile");
  const orgs = (await getStore().listOrganizations({ ownerId: principal.id, limit: 20 })).filter((o) => o.kind === "VENDOR");
  return (
    <VendorProfile
      orgs={orgs.map((o) => ({
        id: o.id,
        name: o.name,
        country: o.country,
        website: o.website,
        registrationNumber: o.registrationNumber,
        description: o.description,
        status: o.status,
        reviewedAt: o.reviewedAt ? o.reviewedAt.toISOString() : null,
        createdAt: o.createdAt.toISOString(),
      }))}
    />
  );
}
