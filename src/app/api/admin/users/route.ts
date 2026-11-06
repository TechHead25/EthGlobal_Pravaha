import { adminListUsers } from "@/server/authz-service";
import { privateRoute, toResponse } from "@/server/api";

export const dynamic = "force-dynamic";

export const GET = privateRoute(
  async ({ req, principal, store }) => toResponse(await adminListUsers(store, principal, req.nextUrl.searchParams.get("q") ?? undefined)),
  { name: "admin:users:list" }
);
