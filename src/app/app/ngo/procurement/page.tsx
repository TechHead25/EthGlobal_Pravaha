import { requirePrincipal } from "@/server/session";
import { NgoProcurement } from "../_components/ngo-procurement";

export const metadata = { title: "Procurement" };

export default async function NgoProcurementPage() {
  await requirePrincipal("ngo:view", "/app/ngo/procurement");
  return <NgoProcurement timingMode={process.env.NEXT_PUBLIC_PROTOCOL_TIMING_MODE === "PRODUCTION" ? "PRODUCTION" : "DEMO"} />;
}
