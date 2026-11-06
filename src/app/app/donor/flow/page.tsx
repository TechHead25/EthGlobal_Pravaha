import { requirePrincipal } from "@/server/session";
import { DonorFlow } from "../_components/donor-flow";

export const metadata = { title: "Live fund flow" };

export default async function DonorFlowPage() {
  await requirePrincipal("donor:view", "/app/donor/flow");
  return <DonorFlow />;
}
