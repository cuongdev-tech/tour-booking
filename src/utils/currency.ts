import { api } from '../services/api';

export interface RatesResponse {
  base: string;
  rates: Record<string, number>;
  vatRate: number;
}

const KEY = 'tourbooking_currency';
let cached: RatesResponse | null = null;
let pending: Promise<RatesResponse | null> | null = null;

export function getCurrency(): string {
  try {
    return localStorage.getItem(KEY) ?? 'VND';
  } catch {
    return 'VND';
  }
}

export function setCurrency(code: string): void {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('currency:changed', { detail: code }));
}

export function getRatesSync(): RatesResponse | null {
  return cached;
}

export async function fetchRates(): Promise<RatesResponse | null> {
  if (cached) return cached;
  if (pending) return pending;
  pending = api
    .get('/payments/rates')
    .then((r) => {
      cached = r.data as RatesResponse;
      return cached;
    })
    .catch(() => null)
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Convert a VND amount to the target currency using rates (rates quote VND per 1 unit). */
export function convert(vnd: number, code: string, rates?: RatesResponse | null): number {
  const r = rates ?? cached;
  if (!r || code === 'VND' || code === r.base) return vnd;
  const rate = r.rates[code];
  if (!rate || rate <= 0) return vnd;
  return vnd / rate;
}

/** Format a VND amount in the target currency. */
export function format(code: string, vnd: number, rates?: RatesResponse | null): string {
  const locale = code === 'USD' ? 'en-US' : code === 'JPY' ? 'ja-JP' : 'vi-VN';
  const value = convert(vnd, code, rates);
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(value);
  } catch {
    return `${value.toLocaleString(locale)} ${code}`;
  }
}
