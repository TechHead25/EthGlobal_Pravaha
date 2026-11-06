import { adminListRoleRequests } from "@/server/authz-service";
import { privateRoute, toResponse } from "@/server/api";

export const dynamic = "force-dynamic";

export const GET = privateRoute(
  async ({ req, principal, store }) => toResponse(await adminListRoleRequests(store, principal, req.nextUrl.searchParams.get("status") ?? undefined)),
  { name: "admin:role-requests:list" }
);
