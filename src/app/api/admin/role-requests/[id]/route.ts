import type { NextRequest } from "next/server";
import { reviewRoleRequest } from "@/server/authz-service";
import { privateRoute, toResponse } from "@/server/api";

export const dynamic = "force-dynamic";

export function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return privateRoute(
    async ({ principal, store, body }) => toResponse(await reviewRoleRequest(store, principal, params.id, body)),
    { name: "admin:role-requests:review", rateLimit: { limit: 120, windowMs: 60 * 60 * 1000 } }
  )(req);
}
