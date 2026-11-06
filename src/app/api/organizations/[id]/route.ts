import type { NextRequest } from "next/server";
import { getOrganizationForPrincipal } from "@/server/authz-service";
import { privateRoute, toResponse } from "@/server/api";

export const dynamic = "force-dynamic";

/** Owner or organization reviewer only; everyone else receives 404. */
export function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return privateRoute(
    async ({ principal, store }) => toResponse(await getOrganizationForPrincipal(store, principal, params.id)),
    { name: "organizations:get" }
  )(req);
}
