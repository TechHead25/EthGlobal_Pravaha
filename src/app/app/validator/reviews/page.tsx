import { requirePrincipal } from "@/server/session";
import { getValidatorContext } from "@/server/validator-context";
import { ValidatorReviews } from "../_components/validator-reviews";

export const metadata = { title: "Motions & review" };

export default async function ValidatorReviewsPage({ searchParams }: { searchParams: { campaign?: string } }) {
  const principal = await requirePrincipal("validator:view", "/app/validator/reviews");
  const focus = /^\d{1,9}$/.test(searchParams.campaign ?? "") ? Number(searchParams.campaign) : null;
  return <ValidatorReviews ctx={getValidatorContext(principal)} focus={focus} />;
}
