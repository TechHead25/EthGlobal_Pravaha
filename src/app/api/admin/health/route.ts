import { can } from "@/lib/auth/roles";
import { FORBIDDEN, UNAUTHENTICATED } from "@/server/authz-service";
import { json, privateRoute, toResponse } from "@/server/api";
import { getIntegrationHealth } from "@/server/integrations";

export const dynamic = "force-dynamic";

export const GET = privateRoute(
  async ({ principal }) => {
    if (!principal) return toResponse(UNAUTHENTICATED);
    if (!can(principal, "admin:view_health")) return toResponse(FORBIDDEN);
    return json({ ok: true, data: await getIntegrationHealth() });
  },
  { name: "admin:health", rateLimit: { limit: 60, windowMs: 60 * 1000 } }
);
