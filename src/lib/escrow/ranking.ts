/** Minimal commitment shape needed to rank bids. */
export interface RankableBid {
  vendor: string;
  commitment: { revealed: boolean; revealedAmount: bigint; revealedAt: number };
}

/**
 * Mirrors OpenAidEscrow.finalizeAuction: only revealed, non-zero bids count; lowest amount
 * wins; ties go to the earliest reveal. Display-only — the contract is authoritative.
 */
export function rankBids<T extends RankableBid>(bids: readonly T[]): T[] {
  return bids
    .filter((b) => b.commitment.revealed && b.commitment.revealedAmount > 0n)
    .sort((a, b) =>
      a.commitment.revealedAmount === b.commitment.revealedAmount
        ? a.commitment.revealedAt - b.commitment.revealedAt
        : a.commitment.revealedAmount < b.commitment.revealedAmount
          ? -1
          : 1
    );
}
