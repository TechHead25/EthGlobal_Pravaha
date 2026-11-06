import { requirePrincipal } from "@/server/session";
import { NgoDelivery } from "../_components/ngo-delivery";

export const metadata = { title: "Delivery & release" };

export default async function NgoDeliveryPage() {
  await requirePrincipal("ngo:view", "/app/ngo/delivery");
  return <NgoDelivery />;
}
