import type { NextRequest } from "next/server";
import { adminSetUserStatus } from "@/server/authz-service";
import { privateRoute, toResponse } from "@/server/api";

export const dynamic = "force-dynamic";

export function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return privateRoute(
    async ({ principal, store, body }) => toResponse(await adminSetUserStatus(store, principal, params.id, body)),
    { name: "admin:users:status", rateLimit: { limit: 60, windowMs: 60 * 60 * 1000 } }
  )(req);
}
