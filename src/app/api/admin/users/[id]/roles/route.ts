import type { NextRequest } from "next/server";
import { adminChangeRole } from "@/server/authz-service";
import { privateRoute, toResponse } from "@/server/api";

export const dynamic = "force-dynamic";

export function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return privateRoute(
    async ({ principal, store, body }) => toResponse(await adminChangeRole(store, principal, params.id, body)),
    { name: "admin:users:roles", rateLimit: { limit: 120, windowMs: 60 * 60 * 1000 } }
  )(req);
}
