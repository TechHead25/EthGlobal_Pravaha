import { getMyAccess } from "@/server/authz-service";
import { privateRoute, toResponse } from "@/server/api";

export const dynamic = "force-dynamic";

export const GET = privateRoute(async ({ principal, store }) => toResponse(await getMyAccess(store, principal)), { name: "me" });
