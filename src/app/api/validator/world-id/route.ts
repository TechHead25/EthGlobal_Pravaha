import { WorldIdVerifier } from "@/lib/worldid/verifier";
import { getWorldIdConfig, isWorldIdConfigured } from "@/lib/worldid/config";
import type { INullifierStore } from "@/lib/worldid/types";
import { worldIdProofSchema } from "@/lib/validation/schemas";
import { bindWorldIdVerification, FORBIDDEN, UNAUTHENTICATED } from "@/server/authz-service";
import { json, privateRoute, toResponse } from "@/server/api";
import { can } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

/**
 * Binds a World ID proof to the signed-in validator's account.
 * - The proof's signal is the server-side user id, so a proof generated for one account
 *   cannot be replayed for another.
 * - Nullifier uniqueness is enforced in PostgreSQL (one human per action).
 * - The proof itself is never stored or logged.
 */
export const POST = privateRoute(
  async ({ principal, store, body }) => {
    if (!principal) return toResponse(UNAUTHENTICATED);
    if (!can(principal, "validator:worldid_verify")) return toResponse(FORBIDDEN);

    const config = getWorldIdConfig();
    if (!isWorldIdConfigured(config)) {
      return json({ ok: false, code: "WORLD_ID_NOT_CONFIGURED", message: "World ID is not configured on this server." }, 503);
    }
    const parsed = worldIdProofSchema.safeParse(body);
    if (!parsed.success) return json({ ok: false, code: "INVALID_INPUT", message: "Invalid World ID proof payload." }, 400);

    const dbNullifiers: INullifierStore = {
      has: async () => false, // uniqueness is enforced atomically by bindWorldIdVerification
      add: async () => undefined,
      clear: async () => undefined,
    };
    const verifier = new WorldIdVerifier({ config, nullifierStore: dbNullifiers });
    const result = await verifier.verifyProof({ ...parsed.data, action: config.action, signal: principal.id }, config.action, principal.id);
    if (!result.success || !result.nullifier_hash) {
      const status = result.error_code === "SERVICE_UNAVAILABLE" || result.error_code === "CONFIGURATION_ERROR" ? 503 : 400;
      return json({ ok: false, code: result.error_code ?? "INVALID_PROOF", message: result.error_message ?? "World ID proof was rejected." }, status);
    }
    return toResponse(await bindWorldIdVerification(store, principal, { action: config.action, nullifierHash: result.nullifier_hash }));
  },
  { name: "validator:world-id", rateLimit: { limit: 10, windowMs: 15 * 60 * 1000 } }
);
