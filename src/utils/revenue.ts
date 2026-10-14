import { currentIntlLocale } from '../i18n/format';

/** Compact number for charts (1.500.000 -> locale-aware "1.5M"). */
export function fmtShort(v: number): string {
  try {
    return new Intl.NumberFormat(currentIntlLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  } catch {
    if (v >= 1_000_000) {
      const m = v / 1_000_000;
      return `${Number(m.toFixed(m >= 10 ? 0 : 1))}M`;
    }
    if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
    return String(v);
  }
}

/** Tháng trong key YYYY-MM của API, null khi key lạ. */
export function monthNumberFromKey(key: string): number | null {
  const m = Number(key.slice(-2));
  return Number.isInteger(m) && m >= 1 && m <= 12 ? m : null;
}
