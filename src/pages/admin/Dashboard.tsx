import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, Map, Users, Wallet } from 'lucide-react';
import { api } from '../../services/api';
import { useEnumLabels } from '../../i18n/enums';
import { formatCurrency } from '../../types';
import { Button, Card, Skeleton, StatCard } from '../../components/ui/kit';

interface Stats {
  users: number;
  tours: number;
  bookings: number;
  revenue: number;
  bookingsByStatus: Array<{ status: string; count: number }>;
  revenueByMonth: Array<{ key: string; label: string; total: number }>;
}

const STATUS_FILL: Record<string, string> = {
  PENDING: '#f59e0b',
  CONFIRMED: '#10b981',
  CANCELLED: '#ef4444',
  COMPLETED: '#0ea5e9',
};

export function AdminDashboard() {
  const { t } = useTranslation();
  const labels = useEnumLabels();
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);

  const load = () => {
    setFailed(false);
    api.get('/admin/stats').then((res) => setStats(res.data)).catch(() => { setStats(null); setFailed(true); });
  };
  useEffect(load, []);

  if (!stats) {
    return failed ? (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm font-medium text-red-700">{t('admin.loadFailed')}</p>
        <Button variant="secondary" onClick={load} className="mt-4">{t('common.retry')}</Button>
      </div>
    ) : (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}
      </div>
    );
  }
  const cards = [
    { icon: <Users className="h-5 w-5" aria-hidden />, label: t('admin.totalUsers'), value: String(stats.users) },
    { icon: <Map className="h-5 w-5" aria-hidden />, label: t('admin.totalTours'), value: String(stats.tours) },
    { icon: <CalendarCheck className="h-5 w-5" aria-hidden />, label: t('admin.totalBookings'), value: String(stats.bookings) },
    { icon: <Wallet className="h-5 w-5" aria-hidden />, label: t('admin.revenue'), value: formatCurrency(stats.revenue) },
  ];

  const statusRows = (stats.bookingsByStatus ?? []).slice().sort((a, b) => b.count - a.count);
  const maxStatus = Math.max(1, ...statusRows.map((r) => r.count));
  const monthRows = stats.revenueByMonth ?? [];
  const monthMax = Math.max(1, ...monthRows.map((m) => m.total));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <StatCard key={c.label} icon={c.icon} label={c.label} value={c.value} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold tracking-tight text-slate-900">{t('admin.chartStatus')}</h2>
          {statusRows.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{t('tours.emptyTitle')}</p>
          ) : (
            <div className="mt-4 space-y-3" role="img" aria-label={t('admin.chartStatus')}>
              {statusRows.map((r) => (
                <div key={r.status} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-xs font-semibold text-slate-600">
                    {labels.bookingStatus(r.status)}
                  </span>
                  <span className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span
                      className="block h-full rounded-full transition-all"
                      style={{ width: `${Math.max(r.count > 0 ? 4 : 0, (r.count / maxStatus) * 100)}%`, backgroundColor: STATUS_FILL[r.status] ?? '#c2410c' }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums text-slate-900">{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold tracking-tight text-slate-900">{t('admin.chartRevenue')}</h2>
          <div className="mt-4 flex h-44 items-end gap-2 sm:gap-3" role="img" aria-label={t('admin.chartRevenue')}>
            {monthRows.map((m) => (
              <div key={m.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className="max-w-full truncate text-[11px] font-bold tabular-nums text-slate-700" title={formatCurrency(m.total)}>
                  {m.total > 0 ? formatCurrency(m.total) : '—'}
                </span>
                <span className="flex h-28 w-full items-end rounded-lg bg-slate-100">
                  <span
                    className="block w-full rounded-lg bg-orange-700 transition-all"
                    style={{ height: `${m.total > 0 ? Math.max(6, (m.total / monthMax) * 100) : 0}%` }}
                  >
                    <title>{`${m.label}: ${formatCurrency(m.total)}`}</title>
                  </span>
                </span>
                <span className="text-[11px] tabular-nums text-slate-400">{m.label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
