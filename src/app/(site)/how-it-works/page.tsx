import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { PageHero } from "@/components/site/page-hero";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LIFECYCLE } from "@/lib/protocol";

export const metadata: Metadata = { title: "How it works" };

const DETAILS: Record<string, { actor: string; onchain: string[]; failure: string }> = {
  funding: {
    actor: "NGO creates the campaign; donors deposit",
    onchain: ["createCampaign(budgetCeiling, fundingDuration, deliveryDuration, metadataCid)", "depositFunds(campaignId, amount) — capped at the ceiling"],
    failure: "If the ceiling is not reached by the funding deadline, anyone can trigger the timeout and every donor can claim a full refund.",
  },
  procurement: {
    actor: "Vendors compete with sealed bids",
    onchain: [
      "commitBid(campaignId, keccak256(amount, salt, vendor)) with a 5% bond",
      "revealBid(campaignId, amount, salt) — must match the commitment and stay within budget",
      "finalizeAuction — lowest valid reveal wins; non-revealers forfeit their bond",
    ],
    failure: "If no vendor commits or reveals a valid bid, the auction fails and donors are refunded in full.",
  },
  delivery: {
    actor: "Winning vendor delivers and submits evidence",
    onchain: ["submitDeliveryEvidence(campaignId, manifestCid) — only the winning vendor, only before the deadline"],
    failure: "Missing the delivery deadline slashes the vendor's bond and opens full donor refunds.",
  },
  validation: {
    actor: "Five registered validators review",
    onchain: ["castVote(campaignId, approve) — one vote per validator", "3 approvals → Stage 1 (70%) released and challenge window opens", "3 rejections → verification failed, refunds open"],
    failure: "Rejected evidence returns every deposit to donors.",
  },
  settlement: {
    actor: "Contract releases or refunds",
    onchain: ["raiseDispute during the challenge window (10% bond)", "finalizeSettlement after the window → remaining 30% + bond to vendor", "claimRefund — donors pull their pro-rata share of any surplus"],
    failure: "An upheld dispute withholds the final 30% from the vendor and returns it to donors as surplus.",
  },
};

export default function HowItWorksPage() {
  return (
    <main id="main">
      <SiteHeader tone="light" />
      <PageHero
        eyebrow="Protocol walkthrough"
        title="How funds move — and when they can't."
        description="Every transition below is enforced by the OpenAidEscrow V1 contract on Arc Testnet. The application can only ask your wallet to call these functions; it cannot move funds itself."
      />
      <div className="container py-16">
        <ol className="space-y-6">
          {LIFECYCLE.map((step, i) => {
            const d = DETAILS[step.key];
            return (
              <li key={step.key} className="surface grid gap-6 p-6 md:grid-cols-[200px_1fr] md:p-8">
                <div>
                  <span className="font-display text-4xl text-muted-foreground/40">{String(i + 1).padStart(2, "0")}</span>
                  <h2 className="mt-2 font-display text-2xl tracking-tight">{step.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{d.actor}</p>
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  <div>
                    <p className="text-sm text-muted-foreground">{step.body}</p>
                    <ul className="mt-4 space-y-2">
                      {d.onchain.map((line) => (
                        <li key={line} className="flex gap-2 text-sm">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-verified" aria-hidden />
                          <code className="font-mono text-[0.8rem]">{line}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-destructive/15 bg-destructive-soft/60 p-4">
                    <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                      <XCircle className="h-4 w-4" aria-hidden /> If it fails
                    </p>
                    <p className="mt-1.5 text-sm text-foreground/80">{d.failure}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <div className="surface p-6">
            <Badge tone="verified">Invariant</Badge>
            <h3 className="mt-3 font-semibold">No discretionary withdrawals</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              The contract has no owner withdrawal, rescue, or sweep function. Application administrators manage access to the
              web workspaces only — they have no ability to move or redirect escrowed funds.
            </p>
          </div>
          <div className="surface p-6">
            <Badge tone="info">Identity</Badge>
            <h3 className="mt-3 font-semibold">Google account ≠ wallet ≠ role</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Google sign-in identifies you to the application. Your wallet signs transactions. Workspace roles are granted by
              audited review. On-chain permissions — like the validator set — are always decided by the contract.
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/campaigns">
              Explore campaigns <ArrowRight aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/transparency">View public activity</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
