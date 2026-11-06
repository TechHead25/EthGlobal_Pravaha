import { adminListAudit } from "@/server/authz-service";
import { privateRoute, toResponse } from "@/server/api";

export const dynamic = "force-dynamic";

export const GET = privateRoute(async ({ principal, store }) => toResponse(await adminListAudit(store, principal)), { name: "admin:audit" });
