/** Số rút gọn cho biểu đồ (1.500.000 -> "1.5tr", 2.000 -> "2k"). */
export function fmtShort(v: number): string {
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    return `${Number(m.toFixed(m >= 10 ? 0 : 1))}tr`;
  }
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(v);
}

/** Tháng trong key YYYY-MM của API, null khi key lạ. */
export function monthNumberFromKey(key: string): number | null {
  const m = Number(key.slice(-2));
  return Number.isInteger(m) && m >= 1 && m <= 12 ? m : null;
}
