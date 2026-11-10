import { getStockLevels } from '@/lib/domains/inventory/stock';

export interface MarkdownSuggestion {
  productId: string;
  name: string;
  onHand: number;
  daysRemaining: number;
  currentRetailPrice: number | null;
  suggestedDiscountPct: number;
  suggestedPrice: number | null;
  rationale: string;
}

function suggestDiscount(daysRemaining: number, pullDays: number): number {
  if (daysRemaining <= 0) return 50;
  if (daysRemaining <= 1) return 40;
  if (daysRemaining <= pullDays) return 30;
  if (daysRemaining <= pullDays + 2) return 20;
  return 15;
}

export async function listMarkdownSuggestions(limit = 12): Promise<MarkdownSuggestion[]> {
  const levels = await getStockLevels();

  const candidates = levels
    .filter((row) => row.onHand > 0 && row.daysRemaining <= row.pullDays + 2)
    .sort((a, b) => a.daysRemaining - b.daysRemaining || b.onHand - a.onHand)
    .slice(0, limit);

  return candidates.map((row) => {
    const pullDays = row.pullDays;
    const discount = suggestDiscount(row.daysRemaining, pullDays);
    const regular = row.regularRetailPrice ?? row.retailPrice;
    const suggestedPrice =
      regular && regular > 0
        ? Number((regular * ((100 - discount) / 100)).toFixed(2))
        : null;
    return {
      productId: row.productId,
      name: row.name,
      onHand: row.onHand,
      daysRemaining: row.daysRemaining,
      currentRetailPrice: row.retailPrice,
      suggestedDiscountPct: discount,
      suggestedPrice,
      rationale:
        row.daysRemaining <= pullDays
          ? 'Inside pull window — prioritize markdown before production rescue or waste.'
          : 'Approaching pull window — early markdown may recover revenue.',
    };
  });
}
