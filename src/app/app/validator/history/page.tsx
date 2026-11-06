import { requirePrincipal } from "@/server/session";
import { getValidatorContext } from "@/server/validator-context";
import { ValidatorHistory } from "../_components/validator-history";

export const metadata = { title: "Decision history" };

export default async function ValidatorHistoryPage() {
  const principal = await requirePrincipal("validator:view", "/app/validator/history");
  return <ValidatorHistory ctx={getValidatorContext(principal)} />;
}
