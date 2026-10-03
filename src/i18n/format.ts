import i18n from './index';
import type { Language } from './types';

const LOCALE_MAP: Record<Language, string> = {
  vi: 'vi-VN',
  en: 'en-US',
  ja: 'ja-JP',
  ko: 'ko-KR',
  zh: 'zh-CN',
};

export function currentIntlLocale(lng?: string): string {
  const code = (lng ?? i18n.language) as Language;
  return LOCALE_MAP[code] ?? 'vi-VN';
}

/** VND amount formatted for the active UI locale. Currency stays VND. */
export function formatMoney(amount: number, lng?: string): string {
  return new Intl.NumberFormat(currentIntlLocale(lng), {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
}

/** Short date (day/month/year order follows the active locale). */
export function formatDateStr(iso: string | Date, lng?: string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString(currentIntlLocale(lng));
}

/** Date + time (order, separators and numerals follow the active locale). */
export function formatDateTimeStr(iso: string | Date, lng?: string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(currentIntlLocale(lng), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
}

/** Compact number (coupon tables). */
export function formatNum(n: number, lng?: string): string {
  return new Intl.NumberFormat(currentIntlLocale(lng)).format(n);
}
