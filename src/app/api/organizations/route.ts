import { createOrganization } from "@/server/authz-service";
import { privateRoute, toResponse } from "@/server/api";

export const dynamic = "force-dynamic";

export const POST = privateRoute(
  async ({ principal, store, body }) => toResponse(await createOrganization(store, principal, body)),
  { name: "organizations:create", rateLimit: { limit: 5, windowMs: 60 * 60 * 1000 } }
);
