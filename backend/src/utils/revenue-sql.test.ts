import { describe, expect, it } from 'vitest';
import { prisma } from '../config/env.js';
import { vnMonthKey } from './revenue-time.js';

// Biểu thức SQL gom trend/category phải cho cùng tháng VN như vnMonthKey.
// Chỉ SELECT literal, không động vào bảng nào.
async function sqlMonthKey(iso: string): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ key: string }>>`
    SELECT to_char(date_trunc('month', (${new Date(iso)}::timestamptz AT TIME ZONE 'UTC' + interval '7 hours')), 'YYYY-MM') AS "key"
  `;
  return rows[0].key;
}

describe('SQL month bucket (VN)', () => {
  it('khớp vnMonthKey ở biên tháng', async () => {
    for (const iso of [
      '2026-09-30T16:59:00.000Z',
      '2026-09-30T17:00:00.000Z',
      '2026-09-30T17:30:00.000Z',
      '2026-12-31T16:59:00.000Z',
      '2026-12-31T17:00:00.000Z',
    ]) {
      await expect(sqlMonthKey(iso)).resolves.toBe(vnMonthKey(new Date(iso)));
    }
  });

  it('rạng sáng VN vào tháng VN', async () => {
    await expect(sqlMonthKey('2026-09-30T17:30:00.000Z')).resolves.toBe('2026-10');
  });
});
