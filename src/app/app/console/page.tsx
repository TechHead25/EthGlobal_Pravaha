import { requirePrincipal } from "@/server/session";
import { Notice } from "@/components/ui/primitives";
import LegacyConsole from "./legacy-console";

export const metadata = { title: "Integration console" };

/**
 * The original single-page integration dashboard, preserved for operators.
 * It mixes live Arc reads with explicitly labeled simulations, so it is restricted to admins.
 */
export default async function ConsolePage() {
  await requirePrincipal("admin:view_health", "/app/console");
  return (
    <div className="space-y-4">
      <Notice tone="warning" title="Developer integration console">
        This is the original V1 integration dashboard. It contains labeled simulations (role switcher, sample CRE inputs, placeholder World ID proofs that the
        real verifier rejects). Use the role workspaces for real actions.
      </Notice>
      <div className="dark-console overflow-hidden rounded-xl bg-[#0a0e17] text-gray-100">
        <LegacyConsole />
      </div>
    </div>
  );
}
