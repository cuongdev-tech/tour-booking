import { describe, expect, it } from 'vitest';
import { fmtShort, monthNumberFromKey } from './revenue';

describe('fmtShort', () => {
  it('triệu -> tr (làm tròn 1 lẻ, >=10tr tròn chẵn)', () => {
    expect(fmtShort(1_500_000)).toBe('1.5tr');
    expect(fmtShort(10_000_000)).toBe('10tr');
    expect(fmtShort(9_650_000)).toBe('9.7tr');
  });

  it('nghìn -> k', () => {
    expect(fmtShort(2_000)).toBe('2k');
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
