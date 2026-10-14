import type { PriceTier } from '../types';

/**
 * Client mirror of backend resolveUnitPrice: highest qualifying tier wins.
 * Tier childPrice falls back to the tour base childPrice (same as backend).
 */
export function resolveUnitPrice(
  tour: { price: number; childPrice?: number | null; priceTiers?: PriceTier[] | null },
  guests: number,
): { price: number; childPrice: number | null; tierMin: number | null } {
  const tiers = [...(tour.priceTiers ?? [])]
    .filter((t) => Number.isFinite(t?.minGuests) && Number.isFinite(t?.price))
    .sort((a, b) => a.minGuests - b.minGuests);
  let price = tour.price;
  let childPrice = tour.childPrice ?? null;
  let tierMin: number | null = null;
  for (const t of tiers) {
    if (guests >= t.minGuests) {
      price = t.price;
      if (t.childPrice != null && t.childPrice > 0) childPrice = t.childPrice;
      tierMin = t.minGuests;
    }
  }
  return { price, childPrice, tierMin };
}

export function tierFare(
  tour: { price: number; childPrice?: number | null; priceTiers?: PriceTier[] | null },
  adults: number,
  children: number,
): { subtotal: number; tierMin: number | null } {
  const units = resolveUnitPrice(tour, adults + children);
  return {
    subtotal: adults * units.price + children * (units.childPrice ?? units.price),
    tierMin: units.tierMin,
  };
}
