import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../services/api';
import { currentIntlLocale } from '../../i18n/format';

interface DayInfo {
  date: string;
  managed: boolean;
  capacity: number | null;
  booked: number | null;
  remaining: number;
  past: boolean;
}

function monthKey(y: number, m: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * Lịch availability theo tháng: số chỗ còn lại từng ngày, hết chỗ, ngày qua.
 * Bấm ngày để chọn (đồng bộ với ô travelDate).
 */
export function AvailabilityCalendar({
  tourId,
  value,
  onChange,
}: {
  tourId: string;
  value: string;
  onChange: (date: string) => void;
}) {
  const { t } = useTranslation();
  const locale = currentIntlLocale();
  const today = useMemo(() => new Date(), []);
  const initial = useMemo(() => {
    const d = value ? new Date(`${value}T00:00:00`) : today;
    return Number.isNaN(d.getTime()) ? today : d;
  }, [value, today]);
  const [viewY, setViewY] = useState(initial.getFullYear());
  const [viewM, setViewM] = useState(initial.getMonth());
  const [cache, setCache] = useState<Record<string, DayInfo[]>>({});
  const [loading, setLoading] = useState(false);

  // Sync calendar view when the picked date changes from elsewhere.
  useEffect(() => {
    if (!value) return;
    const d = new Date(`${value}T00:00:00`);
    if (Number.isNaN(d.getTime())) return;
    setViewY(d.getFullYear());
    setViewM(d.getMonth());
  }, [value]);

  useEffect(() => {
    const key = monthKey(viewY, viewM);
    if (cache[key] || !tourId) return;
    const ctrl = new AbortController();
    setLoading(true);
    api
      .get(`/tours/${tourId}/availability`, { params: { month: key }, signal: ctrl.signal })
      .then((r) => {
        setCache((prev) => ({ ...prev, [key]: (r.data.days ?? []) as DayInfo[] }));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [tourId, viewY, viewM, cache]);

  const days = cache[monthKey(viewY, viewM)] ?? [];
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  const monthLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(viewY, viewM, 1));
    } catch {
      return `${viewM + 1}/${viewY}`;
    }
  }, [locale, viewY, viewM]);

  const weekDays = useMemo(() => {
    // Tuần bắt đầu Thứ 2 (VN).
    const base = new Date(2024, 0, 1); // 2024-01-01 là Thứ 2
    return Array.from({ length: 7 }, (_, i) => {
      try {
        return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(base.getTime() + i * 86400000));
      } catch {
        return ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i];
      }
    });
  }, [locale]);

  // Ô trống đầu tháng (Thứ 2 = cột 0).
  const leading = (new Date(viewY, viewM, 1).getDay() + 6) % 7;
  const dim = new Date(viewY, viewM + 1, 0).getDate();

  const canPrev = viewY > today.getFullYear() || (viewY === today.getFullYear() && viewM > today.getMonth());
  const maxDate = new Date(today.getFullYear(), today.getMonth() + 12, 1);
  const canNext = viewY < maxDate.getFullYear() || (viewY === maxDate.getFullYear() && viewM < maxDate.getMonth());

  const goto = (dy: number, dm: number) => {
    const d = new Date(viewY + dy, viewM + dm, 1);
    setViewY(d.getFullYear());
    setViewM(d.getMonth());
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goto(0, -1)}
          disabled={!canPrev}
          aria-label={t('tours.previous')}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <p className="text-sm font-bold capitalize tabular-nums text-slate-900" aria-live="polite">
          {monthLabel}
          {loading && <span className="ml-2 font-normal text-slate-400">…</span>}
        </p>
        <button
          type="button"
          onClick={() => goto(0, 1)}
          disabled={!canNext}
          aria-label={t('tours.next')}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1" role="row">
        {weekDays.map((w, i) => (
          <span key={`${w}-${i}`} className="pb-1 text-center text-[11px] font-semibold uppercase text-slate-400">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leading }).map((_, i) => (
          <span key={`blank-${i}`} aria-hidden />
        ))}
        {Array.from({ length: dim }).map((_, i) => {
          const day = i + 1;
          const key = `${monthKey(viewY, viewM)}-${String(day).padStart(2, '0')}`;
          const info = byDate.get(key);
          const past = info ? info.past : new Date(viewY, viewM, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const remaining = info ? info.remaining : null;
          const soldOut = info ? remaining !== null && remaining <= 0 : false;
          const low = info ? remaining !== null && remaining > 0 && remaining <= 5 : false;
          const selected = value === key;
          return (
            <button
              key={key}
              type="button"
              disabled={past}
              onClick={() => onChange(key)}
              aria-label={key}
              aria-pressed={selected}
              title={info && remaining !== null ? t('tourDetails.seatsAvailable', { count: remaining }) : key}
              className={`flex min-h-11 flex-col items-center justify-center rounded-xl border px-1 py-1 text-xs tabular-nums transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 ${
                selected
                  ? 'border-orange-700 bg-orange-700 font-bold text-white shadow-sm'
                  : soldOut
                    ? 'border-slate-100 bg-slate-50 text-slate-300 line-through'
                    : past
                      ? 'border-transparent text-slate-300'
                      : low
                        ? 'border-amber-200 bg-amber-50 font-semibold text-amber-800 hover:border-amber-400'
                        : 'border-slate-100 bg-white font-medium text-slate-700 hover:border-orange-300 hover:bg-orange-50'
              } ${past && !selected ? 'cursor-not-allowed' : ''}`}
            >
              <span>{day}</span>
              {info && !past && remaining !== null && !selected && (
                <span className={`text-[10px] font-bold leading-none ${soldOut ? 'text-slate-300' : low ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {soldOut ? '×' : remaining}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {value && byDate.get(value) ? (
        <p className="mt-2 text-center text-[11px] tabular-nums text-slate-400">
          {t('tourDetails.seatsAvailable', { count: (byDate.get(value) as DayInfo).remaining })}
        </p>
      ) : (
        <p className="mt-2 text-center text-[11px] text-slate-400">{t('tourDetails.chooseDate')}</p>
      )}
    </div>
  );
}
