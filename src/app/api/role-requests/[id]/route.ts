import type { NextRequest } from "next/server";
import { withdrawRoleRequest } from "@/server/authz-service";
import { privateRoute, toResponse } from "@/server/api";

export const dynamic = "force-dynamic";

export function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  return privateRoute(
    async ({ principal, store }) => toResponse(await withdrawRoleRequest(store, principal, params.id)),
    { name: "role-requests:withdraw", rateLimit: { limit: 30, windowMs: 60 * 60 * 1000 } }
  )(req);
}
