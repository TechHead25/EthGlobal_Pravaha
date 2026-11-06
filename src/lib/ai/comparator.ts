/**
 * @file comparator.ts
 * @notice Automated procurement specification comparator for OpenAid Protocol.
 * Evaluates extracted invoice data against campaign / sub-vault procurement specs.
 * Detects quantity shortfalls, unapproved substitutions, and price cap breaches.
 */

import { ExtractedInvoice, InvoiceItem } from "./gemini";

export interface SpecItem {
  name: string;
  requiredQuantity: number;
  maxUnitPrice?: number;
  allowedSubstitutions?: string[];
}

export interface ProcurementSpec {
  campaignId: number;
  subVaultId?: string;
  winningBidAmount: number; // Price ceiling (e.g. winning vendor bid in USDC)
  vendorAddress?: string;
  items: SpecItem[];
}

export interface SpecQuantityShortfall {
  item: string;
  required: number;
  provided: number;
  shortfall: number;
}

export interface SpecComparisonDetails {
  quantityShortfalls: SpecQuantityShortfall[];
  unapprovedSubstitutions: string[];
  missingItems: string[];
  priceExceeded: boolean;
  winningBidAmount: number;
  actualTotalAmount: number;
  excessAmount?: number;
}

export interface SpecComparisonResult {
  match: boolean;
  confidenceScore: number; // 0 - 100
  discrepancies: string[];
  itemMatchRate: number; // 0 - 100
  details: SpecComparisonDetails;
}

export class SpecComparator {
  /**
   * Compares an extracted invoice against the required procurement specification.
   */
  public compare(invoice: ExtractedInvoice, spec: ProcurementSpec): SpecComparisonResult {
    const discrepancies: string[] = [];
    const quantityShortfalls: SpecQuantityShortfall[] = [];
    const missingItems: string[] = [];
    const unapprovedSubstitutions: string[] = [];

    // Track which invoice items have been matched to spec items
    const matchedInvoiceItemIndices = new Set<number>();
    let satisfiedItemsCount = 0;

    // 1. Evaluate each required spec item against the invoice items
    for (const specItem of spec.items) {
      const specItemNameNorm = this.normalize(specItem.name);
      const allowedSubsNorm = (specItem.allowedSubstitutions || []).map((s) => this.normalize(s));

      let totalProvidedQty = 0;
      let foundAnyMatch = false;

      invoice.items.forEach((invItem, idx) => {
        const invDescNorm = this.normalize(invItem.description);
        const isDirectMatch =
          invDescNorm.includes(specItemNameNorm) || specItemNameNorm.includes(invDescNorm);
        const isSubMatch = allowedSubsNorm.some(
          (sub) => invDescNorm.includes(sub) || sub.includes(invDescNorm)
        );

        if (isDirectMatch || isSubMatch) {
          foundAnyMatch = true;
          totalProvidedQty += invItem.quantity;
          matchedInvoiceItemIndices.add(idx);
        }
      });

      if (!foundAnyMatch) {
        missingItems.push(specItem.name);
        discrepancies.push(`Missing item: Required item '${specItem.name}' (qty ${specItem.requiredQuantity}) was not found in invoice.`);
      } else if (totalProvidedQty < specItem.requiredQuantity) {
        const shortfall = specItem.requiredQuantity - totalProvidedQty;
        quantityShortfalls.push({
          item: specItem.name,
          required: specItem.requiredQuantity,
          provided: totalProvidedQty,
          shortfall,
        });
        discrepancies.push(
          `Quantity shortfall for '${specItem.name}': Required ${specItem.requiredQuantity}, but invoice provided ${totalProvidedQty} (shortfall: ${shortfall}).`
        );
      } else {
        satisfiedItemsCount++;
      }
    }

    // 2. Identify unapproved substitutions (items on invoice that don't match any spec item or substitution)
    invoice.items.forEach((invItem, idx) => {
      if (!matchedInvoiceItemIndices.has(idx)) {
        unapprovedSubstitutions.push(invItem.description);
        discrepancies.push(
          `Unapproved substitution: Item '${invItem.description}' (qty ${invItem.quantity}) is not part of the procurement specification or allowed substitutions.`
        );
      }
    });

    // 3. Price verification against winning bid ceiling
    const priceTolerance = 0.01;
    const priceExceeded = invoice.totalAmount > spec.winningBidAmount + priceTolerance;
    let excessAmount: number | undefined;

    if (priceExceeded) {
      excessAmount = Math.round((invoice.totalAmount - spec.winningBidAmount) * 100) / 100;
      discrepancies.push(
        `Price exceeded: Invoice total ($${invoice.totalAmount}) exceeds winning bid cap ($${spec.winningBidAmount}) by $${excessAmount}.`
      );
    }

    // 4. Calculate metrics
    const totalRequiredItems = spec.items.length;
    const itemMatchRate =
      totalRequiredItems > 0
        ? Math.round((satisfiedItemsCount / totalRequiredItems) * 1000) / 10
        : 100;

    // Confidence scoring formula (0-100)
    let score = 100;
    // Shortfall penalty (up to 40 pts)
    const shortfallRatio = totalRequiredItems > 0 ? (totalRequiredItems - satisfiedItemsCount) / totalRequiredItems : 0;
    score -= Math.round(shortfallRatio * 40);

    // Unapproved substitution penalty (15 pts per unapproved item, max 30)
    score -= Math.min(30, unapprovedSubstitutions.length * 15);

    // Price breach penalty (up to 30 pts)
    if (priceExceeded) {
      score -= 30;
    }

    const confidenceScore = Math.max(0, Math.min(100, score));
    const match = discrepancies.length === 0;

    return {
      match,
      confidenceScore,
      discrepancies,
      itemMatchRate,
      details: {
        quantityShortfalls,
        unapprovedSubstitutions,
        missingItems,
        priceExceeded,
        winningBidAmount: spec.winningBidAmount,
        actualTotalAmount: invoice.totalAmount,
        excessAmount,
      },
    };
  }

  private normalize(str: string): string {
    return (str || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}

export const specComparator = new SpecComparator();
