import { NextResponse } from "next/server";
import { getCampaigns } from "@/server/chain";

export const revalidate = 30;

/** Public, read-only campaign list read from the escrow contract. */
export async function GET() {
  const res = await getCampaigns();
  return NextResponse.json(res, {
    status: res.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
  });
}
