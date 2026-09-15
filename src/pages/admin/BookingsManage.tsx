import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../../services/api';
import { useEnumLabels } from '../../i18n/enums';
import { formatCurrency, type Booking, type BookingStatus, type Pagination } from '../../types';
import { Select, StatusBadge } from '../../components/ui/kit';
import { AdminPagination } from './Pagination';

const STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'];

export function BookingsManage() {
  const { t } = useTranslation();
  const labels = useEnumLabels();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination | null>(null);

  const load = (p: number = page, s: string = status) => {
    api
      .get('/admin/bookings', { params: { ...(s ? { status: s } : {}), page: p, limit: 10 } })
      .then((r) => {
        setBookings(r.data.data);
        setPagination(r.data.pagination);
      })
      .catch(() => toast.error(t('adminBookings.loadFailed')));
  };
  useEffect(() => { void load(page, status); }, [page, status]);

  const update = async (id: string, next: BookingStatus) => {
    try {
      await api.patch(`/admin/bookings/${id}`, { status: next });
      toast.success(t('adminBookings.updated'));
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('adminBookings.updateFailed')));
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <p className="text-sm text-slate-500">{t('adminBookings.count', { count: pagination?.total ?? bookings.length })}</p>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="max-w-50">
          <option value="">{t('adminBookings.allStatuses')}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{labels.bookingStatus(s)}</option>)}
        </Select>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-200 text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-3">{t('adminBookings.code')}</th><th className="px-4 py-3">{t('adminBookings.tour')}</th><th className="px-4 py-3">{t('adminBookings.total')}</th><th className="px-4 py-3">{t('adminBookings.status')}</th><th className="px-4 py-3 text-right">{t('adminBookings.status')}</th></tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-mono text-xs">{b.bookingCode}</td>
                <td className="max-w-60 truncate px-4 py-3">{(b as Booking & { tour?: { title: string } }).tour?.title ?? b.tourId}</td>
                <td className="px-4 py-3">{formatCurrency(b.total)}</td>
                <td className="px-4 py-3"><StatusBadge status={b.bookingStatus} /></td>
                <td className="px-4 py-3 text-right">
                  <select
                    value={b.bookingStatus}
                    onChange={(e) => void update(b.id, e.target.value as BookingStatus)}
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{labels.bookingStatus(s)}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AdminPagination pagination={pagination} onPage={setPage} />
    </div>
  );
}
