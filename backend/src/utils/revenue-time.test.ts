import { describe, expect, it } from 'vitest';
import { monthBounds, parseDay, vnDayStartUTC, vnMonthKey } from './revenue-time.js';

describe('vnDayStartUTC', () => {
  it('nửa đêm VN = 17:00 UTC hôm trước', () => {
    expect(vnDayStartUTC(2026, 10, 1).toISOString()).toBe('2026-09-30T17:00:00.000Z');
  });

  it('đầu năm không lăn lộn', () => {
    expect(vnDayStartUTC(2026, 1, 1).toISOString()).toBe('2025-12-31T17:00:00.000Z');
  });
});

describe('parseDay', () => {
  it('nhận YYYY-MM-DD và ra biên 24h giờ VN', () => {
    const day = parseDay('2026-10-01');
    expect(day).not.toBeNull();
    expect(day!.label).toBe('2026-10-01');
    expect(day!.start.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(day!.end.toISOString()).toBe('2026-10-01T17:00:00.000Z');
    expect(day!.end.getTime() - day!.start.getTime()).toBe(24 * 3600_000);
  });

  it('từ chối ngày tràn (30/02 -> lăn sang 03/02)', () => {
    expect(parseDay('2026-02-30')).toBeNull();
    expect(parseDay('2026-13-01')).toBeNull();
    expect(parseDay('2026-00-10')).toBeNull();
    expect(parseDay('2026-04-31')).toBeNull();
  });

  it('nhuận 29/02 năm nhuận vẫn qua', () => {
    expect(parseDay('2024-02-29')?.label).toBe('2024-02-29');
    expect(parseDay('2026-02-29')).toBeNull();
  });

  it('từ chối rỗng / rác / thiếu', () => {
    expect(parseDay(undefined)).toBeNull();
    expect(parseDay('')).toBeNull();
    expect(parseDay('   ')).toBeNull();
    expect(parseDay('hom-nay')).toBeNull();
    expect(parseDay(123)).toBeNull();
  });

  it('chấp nhận ISO đầy đủ (lấy ngày UTC)', () => {
    expect(parseDay('2026-10-01T00:00:00.000Z')?.label).toBe('2026-10-01');
  });
});

describe('monthBounds', () => {
  it('tháng 10/2026 theo giờ VN', () => {
    const { start, end } = monthBounds(10, 2026);
    expect(start.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-31T17:00:00.000Z');
  });

  it('kẹp tháng ngoài biên về 1..12', () => {
    expect(monthBounds(0, 2026).start.toISOString()).toBe(monthBounds(1, 2026).start.toISOString());
    expect(monthBounds(99, 2026).start.toISOString()).toBe(monthBounds(12, 2026).start.toISOString());
  });

  it('tháng 12 lăn sang tháng 1 năm sau', () => {
    const { start, end } = monthBounds(12, 2026);
    expect(start.toISOString()).toBe('2026-11-30T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-31T17:00:00.000Z');
  });
});

describe('vnMonthKey', () => {
  it('giao dịch rạng sáng VN tính vào tháng VN', () => {
    // 30/09 17:30 UTC = 01/10 00:30 VN -> tháng 10
    expect(vnMonthKey(new Date('2026-09-30T17:30:00.000Z'))).toBe('2026-10');
    expect(vnMonthKey(new Date('2026-09-30T16:59:00.000Z'))).toBe('2026-09');
  });

  it('biên năm: 31/12 17:00 UTC = 01/01 VN', () => {
    expect(vnMonthKey(new Date('2026-12-31T16:59:00.000Z'))).toBe('2026-12');
    expect(vnMonthKey(new Date('2026-12-31T17:00:00.000Z'))).toBe('2027-01');
  });
});
