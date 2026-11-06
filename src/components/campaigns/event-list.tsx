import { ExternalLink } from "lucide-react";
import type { EscrowEvent } from "@/server/chain";
import { getExplorerTxUrl } from "@/lib/arc/config";
import { formatTokenAmount, shortAddress } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const AMOUNT_ARGS = new Set(["amount", "budgetCeiling", "totalAmount", "winningAmount", "payoutAmount", "bondAmount"]);
const ADDRESS_ARGS = new Set(["donor", "creator", "vendor", "winningVendor", "validator", "challenger"]);

const EVENT_TONE: Record<string, "verified" | "pending" | "info" | "failed" | "neutral"> = {
  FundsDeposited: "verified",
  CampaignFullyFunded: "verified",
  Stage1Settled: "verified",
  Stage2Settled: "verified",
  QuorumReached: "verified",
  RefundClaimed: "info",
  DisputeRaised: "failed",
  VoteCast: "pending",
};

function renderArg(key: string, value: string) {
  if (AMOUNT_ARGS.has(key)) return `${formatTokenAmount(BigInt(value))} USDC`;
  if (ADDRESS_ARGS.has(key)) return shortAddress(value);
  if (value.length > 24) return `${value.slice(0, 18)}…`;
  return value;
}

export function EventList({ events, showCampaign = false }: { events: EscrowEvent[]; showCampaign?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-semibold">Event</th>
            {showCampaign ? <th scope="col" className="px-4 py-2.5 font-semibold">Campaign</th> : null}
            <th scope="col" className="px-4 py-2.5 font-semibold">Details</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Block</th>
            <th scope="col" className="px-4 py-2.5 font-semibold"><span className="sr-only">Transaction</span></th>
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => (
            <tr key={`${e.txHash}-${i}`} className="border-t">
              <td className="px-4 py-3">
                <Badge tone={EVENT_TONE[e.name] ?? "neutral"}>{e.name}</Badge>
              </td>
              {showCampaign ? <td className="px-4 py-3">#{e.campaignId}</td> : null}
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {Object.entries(e.args)
                  .filter(([k]) => k !== "campaignId")
                  .map(([k, v]) => (
                    <span key={k} className="mr-3 inline-block">
                      <span className="text-foreground/60">{k}</span> <span className="font-mono">{renderArg(k, v)}</span>
                    </span>
                  ))}
              </td>
              <td className="px-4 py-3 font-mono text-xs">{e.blockNumber.toLocaleString("en-US")}</td>
              <td className="px-4 py-3 text-right">
                <a href={getExplorerTxUrl(e.txHash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-verified hover:underline">
                  {shortAddress(e.txHash, 4)} <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
