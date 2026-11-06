import "server-only";
import deployment from "../../deployments/arcTestnet-5042002.json";
import { getEscrowAddress } from "@/lib/arc/config";
import { getWorldIdConfig, isWorldIdConfigured } from "@/lib/worldid/config";
import type { Principal } from "@/lib/auth/roles";

export interface ValidatorContext {
  worldId: { verifiedAt: string | null; configured: boolean; appId: string; action: string; level: "orb" | "device"; signal: string };
  /** Validator addresses recorded at deployment; on-chain status is re-checked live in the browser. */
  deploymentValidators: string[];
  challengeWindowSeconds: number;
}

export function getValidatorContext(principal: Principal): ValidatorContext {
  const wid = getWorldIdConfig();
  const sameEscrow = deployment.openAidEscrow?.address?.toLowerCase() === getEscrowAddress().toLowerCase();
  return {
    worldId: {
      verifiedAt: principal.worldIdVerifiedAt ? principal.worldIdVerifiedAt.toISOString() : null,
      configured: isWorldIdConfigured(wid),
      appId: wid.appId,
      action: wid.action,
      level: wid.minimumLevel,
      signal: principal.id,
    },
    deploymentValidators: sameEscrow ? deployment.validators : [],
    // DEMO: short challenge window for testnet walkthroughs; PRODUCTION: 0 → contract default (72h).
    challengeWindowSeconds: process.env.NEXT_PUBLIC_PROTOCOL_TIMING_MODE === "PRODUCTION" ? 0 : 600,
  };
}
