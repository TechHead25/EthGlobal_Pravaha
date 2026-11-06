import { requirePrincipal } from "@/server/session";
import { getValidatorContext } from "@/server/validator-context";
import { ValidatorOverview } from "./_components/validator-overview";

export const metadata = { title: "Validator" };

export default async function ValidatorPage() {
  const principal = await requirePrincipal("validator:view", "/app/validator");
  return <ValidatorOverview ctx={getValidatorContext(principal)} />;
}
