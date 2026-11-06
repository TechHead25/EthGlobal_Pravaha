import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { PERMISSIONS } from "@/lib/auth/roles";

export const metadata = { title: "Access required" };

const HINTS: Record<string, string> = {
  donor: "Request the Donor role from Access & roles — it is granted immediately.",
  ngo: "Submit an NGO organization profile, then request the NGO role for review.",
  vendor: "Submit a vendor organization profile, then request the Vendor role for review.",
  validator: "Validator access is assigned by an administrator after review.",
  admin: "Administrator access is provisioned by the platform operator only.",
};

export default function ForbiddenPage({ searchParams }: { searchParams: { need?: string } }) {
  const need = (PERMISSIONS as readonly string[]).includes(searchParams.need ?? "") ? searchParams.need! : null;
  const area = need?.split(":")[0] ?? "";
  return (
    <EmptyState
      icon={ShieldAlert}
      title="You don’t have access to this workspace"
      description={
        <>
          {need ? <p className="font-mono text-xs">Requires: {need}</p> : null}
          <p className="mt-2">{HINTS[area] ?? "Request the appropriate role from Access & roles."}</p>
        </>
      }
      action={
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/app/access">Request access</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app/dashboard">Back to overview</Link>
          </Button>
        </div>
      }
      className="mt-10"
    />
  );
}
