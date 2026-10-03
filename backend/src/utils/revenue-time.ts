/**
 * Biên thời gian cho báo cáo doanh thu.
 * DB lưu UTC nhưng người dùng xem giờ VN (UTC+7): nửa đêm VN = 17:00 UTC hôm
 * trước. Mọi biên ngày/tháng đều trừ 7h để khớp lịch treo trên web.
 */
export const VN_OFFSET_MS = 7 * 3600_000;

export function vnDayStartUTC(y: number, mo: number, d: number): Date {
  return new Date(Date.UTC(y, mo - 1, d) - VN_OFFSET_MS);
}

export function monthBounds(month: number, year: number): { start: Date; end: Date } {
  const m = Math.min(12, Math.max(1, Math.floor(month)));
  const y = Math.floor(year);
  return {
    start: vnDayStartUTC(y, m, 1),
    // Date.UTC tự lăn tháng 13 -> tháng 1 năm sau.
    end: vnDayStartUTC(y, m + 1, 1),
  };
}

export function parseDay(input?: unknown): { start: Date; end: Date; label: string } | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  const raw = input.trim();
  // Chấp nhận YYYY-MM-DD (từ <input type="date">) hoặc ISO đầy đủ.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  let y: number;
  let mo: number;
  let d: number;
  if (m) {
    y = Number(m[1]);
    mo = Number(m[2]);
    d = Number(m[3]);
  } else {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    y = parsed.getUTCFullYear();
    mo = parsed.getUTCMonth() + 1;
    d = parsed.getUTCDate();
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const start = vnDayStartUTC(y, mo, d);
  if (Number.isNaN(start.getTime())) return null;
  // Date.UTC tự lăn ngày tràn (02-30 -> 03-02): đổi ngược về giờ VN để loại.
  const back = new Date(start.getTime() + VN_OFFSET_MS);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  const end = new Date(start.getTime() + 24 * 3600_000);
  const label = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { start, end, label };
}

/** Key YYYY-MM theo lịch VN (không phải UTC) để xếp đúng tháng hiển thị. */
export function vnMonthKey(d: Date): string {
  const v = new Date(d.getTime() + VN_OFFSET_MS);
  return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}`;
}
