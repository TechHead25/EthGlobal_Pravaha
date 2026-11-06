"use client";

import { useRouter } from "next/navigation";
import { HandCoins } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

/**
 * Uses the EXISTING role-request API (POST /api/role-requests). Donor is a self-service role
 * under the existing policy, so the server grants it immediately and audits it — this button
 * adds no new authorization path.
 */
export function ActivateDonorButton() {
  const router = useRouter();
  return (
    <Button
      onClick={async () => {
        const res = await apiFetch("/api/role-requests", {
          method: "POST",
          body: { role: "DONOR", justification: "Activated from the member overview to donate to campaigns." },
        });
        if (!res.ok) return void toast.error("Could not activate donor access", { description: res.message });
        toast.success("Donor access activated");
        router.push("/app/donor/campaigns");
        router.refresh();
      }}
    >
      <HandCoins aria-hidden /> Start donating
    </Button>
  );
}
