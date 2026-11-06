"use client";

import { useRouter } from "next/navigation";
import { IDKitWidget, VerificationLevel, type ISuccessResult } from "@worldcoin/idkit";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

/**
 * Real World ID flow: IDKit produces a proof whose signal is this account's id; the server
 * verifies it with the World ID API and binds the nullifier. Nothing is simulated.
 */
export default function WorldIdVerify({ appId, action, signal, level }: { appId: `app_${string}`; action: string; signal: string; level: "orb" | "device" }) {
  const router = useRouter();
  async function handleVerify(result: ISuccessResult) {
    const res = await apiFetch("/api/validator/world-id", {
      method: "POST",
      body: {
        merkle_root: result.merkle_root,
        nullifier_hash: result.nullifier_hash,
        proof: result.proof,
        verification_level: result.verification_level === "orb" ? "orb" : "device",
      },
    });
    if (!res.ok) {
      // Throwing surfaces the error inside the IDKit modal.
      throw new Error(res.message);
    }
  }
  return (
    <IDKitWidget
      app_id={appId}
      action={action}
      signal={signal}
      verification_level={level === "orb" ? VerificationLevel.Orb : VerificationLevel.Device}
      handleVerify={handleVerify}
      onSuccess={() => {
        toast.success("World ID verified for this account");
        router.refresh();
      }}
    >
      {({ open }: { open: () => void }) => <Button onClick={open}>Verify with World ID</Button>}
    </IDKitWidget>
  );
}
