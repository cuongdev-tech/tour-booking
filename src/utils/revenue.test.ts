import { describe, expect, it } from 'vitest';
import { fmtShort, monthNumberFromKey } from './revenue';

describe('fmtShort', () => {
  // Locale-aware compact (vi-VN default: "1,5 Tr", en-US: "1.5M").
  const norm = (s: string) => s.replace(/[\s\u00A0\u202F]/g, ' ');
  it('triệu -> compact (1 số lẻ, >=10 tròn chẵn)', () => {
    expect(norm(fmtShort(1_500_000))).toMatch(/1[,.]5\s?(Tr|M)/);
    expect(norm(fmtShort(10_000_000))).toMatch(/10\s?(Tr|M)/);
    expect(norm(fmtShort(9_650_000))).toMatch(/9[,.]7\s?(Tr|M)/);
  });

  it('nghìn -> compact', () => {
    expect(norm(fmtShort(2_000))).toMatch(/2\s?(N|K)/);
    expect(fmtShort(0)).toBe('0');
    expect(fmtShort(999)).toBe('999');
  });
});

describe('monthNumberFromKey', () => {
  it('lấy tháng từ key YYYY-MM', () => {
    expect(monthNumberFromKey('2026-10')).toBe(10);
    expect(monthNumberFromKey('2026-01')).toBe(1);
  });

  it('trả null khi key lạ', () => {
    expect(monthNumberFromKey('2026-13')).toBeNull();
    expect(monthNumberFromKey('2026-00')).toBeNull();
    expect(monthNumberFromKey('oops')).toBeNull();
    expect(monthNumberFromKey('')).toBeNull();
  });
});
