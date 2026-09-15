import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import { formatCurrency } from '../../types';
import { Card, Skeleton } from '../../components/ui/kit';

export function AdminDashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<{ users: number; tours: number; bookings: number; revenue: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.get('/admin/stats').then((res) => setStats(res.data)).catch(() => { setStats(null); setFailed(true); });
  }, []);

  if (!stats) {
    return failed
      ? <p className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t('admin.loadFailed')}</p>
      : <Skeleton className="h-40" />;
  }
  const cards = [
    { label: t('admin.totalUsers'), value: String(stats.users) },
    { label: t('admin.totalTours'), value: String(stats.tours) },
    { label: t('admin.totalBookings'), value: String(stats.bookings) },
    { label: t('admin.revenue'), value: formatCurrency(stats.revenue) },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label} className="p-6">
          <p className="text-sm text-slate-500">{c.label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{c.value}</p>
        </Card>
      ))}
    </div>
  );
}
