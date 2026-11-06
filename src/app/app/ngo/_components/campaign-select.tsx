"use client";

import type { CampaignView } from "@/lib/escrow/types";
import { Select } from "@/components/ui/input";
import { CampaignStatusBadge } from "@/components/dashboard/common";

export function CampaignSelect({ campaigns, value, onChange }: { campaigns: CampaignView[]; value: number | undefined; onChange: (id: number) => void }) {
  const current = campaigns.find((c) => c.id === value);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label="Choose campaign" className="max-w-sm">
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>#{c.id} · {c.metadata?.title || "Untitled campaign"}</option>
        ))}
      </Select>
      {current ? <CampaignStatusBadge state={current.state} /> : null}
    </div>
  );
}
