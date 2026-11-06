import { adminListOrganizations } from "@/server/authz-service";
import { privateRoute, toResponse } from "@/server/api";

export const dynamic = "force-dynamic";

export const GET = privateRoute(
  async ({ req, principal, store }) => toResponse(await adminListOrganizations(store, principal, req.nextUrl.searchParams.get("status") ?? undefined)),
  { name: "admin:organizations:list" }
);
