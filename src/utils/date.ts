/** Local calendar-day helpers (VN is UTC+7: a UTC ISO slice is "yesterday" after midnight). */

/** YYYY-MM-DD for <input type="date"> min attributes. */
export function todayLocalInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Start of today (local time) as a timestamp, for past-date comparisons. */
export function startOfTodayLocal(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Start of today in UTC as a timestamp. The backend compares travel days in
 * UTC (date-only strings parse as UTC midnight), so UI pre-validation must
 * use the same frame — otherwise a date the UI accepts could fail server-side
 * (or vice versa) near midnight across timezones.
 */
export function startOfTodayUtc(): number {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
