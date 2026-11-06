import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/site-header";
import { PageHero } from "@/components/site/page-hero";
import { Badge } from "@/components/ui/badge";
import { CAPABILITIES, CAPABILITY_STATUS_COPY } from "@/lib/capabilities";

export const metadata: Metadata = { title: "About" };

const PRINCIPLES = [
  ["No unilateral custody", "No participant — NGO, deployer, or administrator — can withdraw, sweep, or redirect escrowed funds. Money leaves only to the verified winning vendor or back to donors."],
  ["Separation of duties", "Need definition, funding, supply, and verification are held by different parties. Application administrators govern access, not outcomes."],
  ["Truthful interfaces", "Every number is labeled with where it came from. Simulated or planned features are marked as such. Unconfirmed transactions are never shown as successful."],
  ["Privacy by default", "We store the minimum account data needed to sign you in. No OAuth tokens, private keys, or World ID proofs are retained."],
];

export default function AboutPage() {
  return (
    <main id="main">
      <SiteHeader tone="light" />
      <PageHero
        eyebrow="About"
        title="Built so trust is not required."
        description="OpenAid Protocol is an open-source procurement and settlement layer for humanitarian aid. It started as an ETHGlobal project and runs on Arc Testnet."
      />
      <div className="container space-y-16 py-14">
        <section aria-labelledby="principles">
          <h2 id="principles" className="font-display text-3xl tracking-tight">Design principles</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {PRINCIPLES.map(([t, b]) => (
              <div key={t} className="surface p-6">
                <h3 className="font-semibold">{t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{b}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="status">
          <h2 id="status" className="font-display text-3xl tracking-tight">What is live today</h2>
          <ul className="mt-6 divide-y rounded-lg border bg-card">
            {CAPABILITIES.map((c) => (
              <li key={c.key} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{c.title}</p>
                  <p className="text-sm text-muted-foreground">{c.detail}</p>
                </div>
                <Badge tone={CAPABILITY_STATUS_COPY[c.status].tone}>{CAPABILITY_STATUS_COPY[c.status].label}</Badge>
              </li>
            ))}
          </ul>
        </section>

        <section id="privacy" aria-labelledby="privacy-h" className="scroll-mt-24">
          <h2 id="privacy-h" className="font-display text-3xl tracking-tight">Privacy</h2>
          <div className="mt-4 max-w-3xl space-y-3 text-sm text-muted-foreground">
            <p>When you sign in with Google we store your Google account identifier, email address, display name, and profile image URL, plus the roles and organization details you submit. We do not store Google access or refresh tokens.</p>
            <p>Wallet addresses are public on-chain identifiers; the application does not store private keys or seed phrases and never asks for them. World ID verification stores only an action-scoped nullifier to prevent reuse — never the proof.</p>
            <p>Security-relevant actions (sign-in, role requests, approvals, revocations, suspensions) are recorded in an audit log visible to administrators.</p>
          </div>
        </section>

        <section id="terms" aria-labelledby="terms-h" className="scroll-mt-24">
          <h2 id="terms-h" className="font-display text-3xl tracking-tight">Terms of use</h2>
          <div className="mt-4 max-w-3xl space-y-3 text-sm text-muted-foreground">
            <p>OpenAid is experimental, open-source software provided under the MIT License, without warranty. This deployment runs on Arc Testnet; testnet tokens have no monetary value.</p>
            <p>The smart contracts have not been independently audited. Do not use this deployment for real humanitarian funds.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
