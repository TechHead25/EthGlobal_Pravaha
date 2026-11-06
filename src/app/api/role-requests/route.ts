import { requestRole } from "@/server/authz-service";
import { privateRoute, toResponse } from "@/server/api";

export const dynamic = "force-dynamic";

/** Create a role request. Only `role`, `justification`, `walletAddress`, `organizationId` are accepted (strict schema). */
export const POST = privateRoute(
  async ({ principal, store, body }) => toResponse(await requestRole(store, principal, body)),
  { name: "role-requests:create", rateLimit: { limit: 10, windowMs: 60 * 60 * 1000 } }
);
