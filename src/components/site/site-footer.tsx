import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { getExplorerAddressUrl, getEscrowAddress } from "@/lib/arc/config";

const REPO_URL = "https://github.com/TechHead25/EthGlobal_Pravaha";

/**
 * Footer links point only at destinations that exist: in-app pages, the public repository,
 * and the explorer for the configured escrow. Support/social links appear only when their
 * env vars are set.
 */
export function SiteFooter() {
  const support = process.env.NEXT_PUBLIC_SUPPORT_URL;
  const security = process.env.NEXT_PUBLIC_SECURITY_CONTACT_URL;
  const social = process.env.NEXT_PUBLIC_SOCIAL_URL;
  const columns = [
    {
      title: "Protocol",
      links: [
        { href: "/how-it-works", label: "How it works" },
        { href: "/campaigns", label: "Campaigns" },
        { href: "/transparency", label: "Transparency" },
        { href: "/about", label: "About" },
      ],
    },
    {
      title: "Developers",
      links: [
        { href: `${REPO_URL}#readme`, label: "Documentation", external: true },
        { href: `${REPO_URL}/blob/main/docs/PROTOCOL_RULES.md`, label: "Protocol rules", external: true },
        { href: getExplorerAddressUrl(getEscrowAddress()), label: "Escrow contract", external: true },
      ],
    },
    {
      title: "Trust",
      links: [
        { href: "/about#privacy", label: "Privacy" },
        { href: "/about#terms", label: "Terms of use" },
        security
          ? { href: security, label: "Security disclosure", external: true }
          : { href: `${REPO_URL}/blob/main/docs/SECURITY_REQUIREMENTS.md`, label: "Security model", external: true },
        ...(support ? [{ href: support, label: "Support", external: true }] : []),
        ...(social ? [{ href: social, label: "Community", external: true }] : []),
      ],
    },
  ];
  return (
    <footer className="ink-backdrop text-white">
      <div className="container grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Logo tone="dark" />
          <p className="mt-4 text-sm text-white/55">
            Accountable humanitarian procurement. Escrowed funds leave only to a verified vendor or back to donors.
          </p>
          <p className="mt-4 text-xs text-white/40">Running on Arc Testnet. Testnet USDC has no monetary value.</p>
        </div>
        {columns.map((c) => (
          <div key={c.title}>
            <p className="eyebrow text-white/45">{c.title}</p>
            <ul className="mt-4 space-y-2.5">
              {c.links.map((l) => (
                <li key={l.label}>
                  {"external" in l && l.external ? (
                    <a href={l.href} target="_blank" rel="noreferrer" className="text-sm text-white/70 hover:text-white">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="text-sm text-white/70 hover:text-white">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/[0.07]">
        <div className="container flex flex-col gap-2 py-6 text-xs text-white/40 sm:flex-row sm:justify-between">
          <span>© {new Date().getUTCFullYear()} OpenAid Protocol contributors · MIT License</span>
          <span>Testnet deployment. Contracts have not been independently audited.</span>
        </div>
      </div>
    </footer>
  );
}
