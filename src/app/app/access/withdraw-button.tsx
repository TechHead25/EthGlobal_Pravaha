"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";

export function WithdrawButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={<Button size="sm" variant="ghost">Withdraw</Button>}
      title="Withdraw this request?"
      description="The request will be closed. You can submit a new one later."
      confirmLabel="Withdraw"
      tone="destructive"
      onConfirm={async () => {
        const res = await apiFetch(`/api/role-requests/${id}`, { method: "DELETE" });
        if (!res.ok) toast.error("Could not withdraw", { description: res.message });
        else {
          toast.success("Request withdrawn");
          router.refresh();
        }
      }}
    />
  );
}
