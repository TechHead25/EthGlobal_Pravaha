import { Gavel, HandCoins, PackageCheck, ShieldCheck, Undo2, Users } from "lucide-react";

/**
 * Hero product visual. It depicts the real rules enforced by OpenAidEscrow V1
 * (budget ceiling, 5% bid bond, 3-of-5 quorum, 70/30 staged release, pull refunds).
 * It is explicitly labeled as illustrative — it is not a live campaign.
 */
export function EscrowFlowVisual() {
  const stages = [
    { icon: HandCoins, title: "Escrow funded", rule: "Deposits capped at the budget ceiling", tag: "Donors" },
    { icon: Gavel, title: "Sealed-bid procurement", rule: "5% bond · commit → reveal · lowest valid bid wins", tag: "Vendors" },
    { icon: PackageCheck, title: "Delivery evidence", rule: "Manifest CID anchored before the deadline", tag: "Winning vendor" },
    { icon: Users, title: "Validator quorum", rule: "3 of 5 approvals · one vote per validator", tag: "Validators" },
  ];
  return (
    <div className="glass-dark relative overflow-hidden rounded-2xl p-5 text-white sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow text-white/45">Escrow lifecycle</p>
          <p className="mt-1 text-sm font-medium">OpenAidEscrow V1 · rules enforced on-chain</p>
        </div>
        <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-[0.7rem] text-white/60">Illustrative</span>
      </div>

      <ol className="mt-5 space-y-2.5">
        {stages.map((s, i) => (
          <li key={s.title} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-[hsl(166_70%_60%)]">
              <s.icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                <span className="mr-1.5 text-white/35">{String(i + 1).padStart(2, "0")}</span>
                {s.title}
              </p>
              <p className="truncate text-xs text-white/50">{s.rule}</p>
            </div>
            <span className="hidden shrink-0 text-[0.7rem] text-white/40 sm:inline">{s.tag}</span>
          </li>
        ))}
      </ol>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-[1fr_auto]">
        <div className="rounded-xl border border-[hsl(166_70%_45%/0.25)] bg-[hsl(166_70%_40%/0.08)] p-3.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-[hsl(166_70%_60%)]" aria-hidden /> Staged settlement to the winning vendor
          </div>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/10" aria-hidden>
            <div className="w-[70%] bg-[hsl(166_70%_45%)]" />
            <div className="w-[30%] bg-[hsl(166_70%_45%/0.4)]" />
          </div>
          <div className="mt-1.5 flex justify-between text-[0.7rem] text-white/50">
            <span>70% on quorum</span>
            <span>30% after challenge window</span>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5 text-xs text-white/60 sm:max-w-[11rem]">
          <Undo2 className="h-4 w-4 shrink-0 text-white/50" aria-hidden />
          Any failure path: donors pull refunds
        </div>
      </div>
    </div>
  );
}
