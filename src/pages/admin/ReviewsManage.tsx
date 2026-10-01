import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../../services/api';
import type { Pagination, Review } from '../../types';
import { Badge, Button, Modal, Stars, TableCard, TableEmpty, Td, Th } from '../../components/ui/kit';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { AdminPagination } from './Pagination';

export function ReviewsManage() {
  const { t } = useTranslation();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [inspect, setInspect] = useState<Review | null>(null);
  const [hiddenFilter, setHiddenFilter] = useState('');

  const load = (p: number = page, h: string = hiddenFilter) =>
    api
      .get('/admin/reviews', { params: { page: p, limit: 10, ...(h !== '' ? { hidden: h } : {}) } })
      .then((r) => {
        setReviews(r.data.data);
        setPagination(r.data.pagination);
      })
      .catch((err) => toast.error(apiErrorMessage(err, t('adminReviews.loadFailed'))));
  useEffect(() => { void load(page, hiddenFilter); }, [page, hiddenFilter]);

  const setHidden = async (id: string, hidden: boolean) => {
    try {
      await api.patch(`/admin/reviews/${id}`, { hidden });
      toast.success(t('adminReviews.updated'));
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('adminReviews.updateFailed')));
    }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/admin/reviews/${id}`);
      toast.success(t('adminReviews.deleted'));
      setDeleteId(null);
      if (reviews.length === 1 && page > 1) setPage(page - 1);
      else await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('adminReviews.deleteFailed')));
      setDeleteId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">{t('adminReviews.title')}</h2>
        <div className="flex items-center gap-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={hiddenFilter === '1'}
              onChange={(e) => { setHiddenFilter(e.target.checked ? '1' : ''); setPage(1); }}
              className="h-4 w-4 rounded border-slate-300 accent-orange-700"
            />
            {t('adminReviews.hidden')}
          </label>
          <p className="text-sm tabular-nums text-slate-500">{t('adminReviews.count', { count: pagination?.total ?? reviews.length })}</p>
        </div>
      </div>
      <TableCard>
        <table className="w-full min-w-200 text-left">
          <thead className="bg-slate-50">
            <tr>
              <Th>{t('adminBookings.tour')}</Th>
              <Th>{t('adminUsers.user')}</Th>
              <Th>{t('bookings.reviewRating')}</Th>
              <Th>{t('bookings.reviewComment')}</Th>
              <Th>{t('adminReviews.hidden')}</Th>
              <Th right>{t('admin.actions')}</Th>
            </tr>
          </thead>
          <tbody>
            {reviews.length === 0 && (
              <TableEmpty colSpan={6}>{t('tours.emptyTitle')}</TableEmpty>
            )}
            {reviews.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-slate-50/60">
                <Td className="max-w-50 truncate font-medium text-slate-900">
                  {r.tour ? (
                    <Link to={`/tour/${r.tour.id}`} className="rounded transition-colors hover:text-orange-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700">
                      {r.tour.title}
                    </Link>
                  ) : r.tourId}
                </Td>
                <Td className="max-w-40 truncate">{r.user?.name ?? r.userId}</Td>
                <Td><Stars value={r.rating} /></Td>
                <Td className="max-w-70">
                  <button
                    type="button"
                    onClick={() => setInspect(r)}
                    className="line-clamp-2 rounded text-left text-sm text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                    title={r.comment ?? ''}
                  >
                    {r.comment || '—'}
                  </button>
                </Td>
                <Td>
                  <Badge className={r.hidden ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-800'}>
                    {r.hidden ? t('adminReviews.hidden') : `${r.rating} / 5`}
                  </Badge>
                </Td>
                <Td right>
                  <span className="inline-flex items-center gap-1">
                    <Button variant="ghost" onClick={() => void setHidden(r.id, !r.hidden)} className="px-2 text-orange-700 hover:bg-orange-50">
                      {r.hidden ? t('adminReviews.unhide') : t('adminReviews.hide')}
                    </Button>
                    <Button variant="ghost" onClick={() => setDeleteId(r.id)} className="px-2 text-red-600 hover:bg-red-50">
                      {t('adminReviews.delete')}
                    </Button>
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
      <AdminPagination pagination={pagination} onPage={setPage} />
      <ConfirmDialog
        open={deleteId !== null}
        title={t('adminReviews.deleteTitle')}
        message={t('adminReviews.deleteMessage')}
        confirmLabel={t('adminReviews.delete')}
        cancelLabel={t('adminTours.cancel')}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && void remove(deleteId)}
      />
      <Modal open={inspect !== null} onClose={() => setInspect(null)} label={t('bookings.reviewComment')} wide>
        {inspect && (
          <div>
            <div className="flex items-center justify-between gap-2">
              <Stars value={inspect.rating} />
              <Badge className={inspect.hidden ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-800'}>
                {inspect.hidden ? t('adminReviews.hidden') : `${inspect.rating} / 5`}
              </Badge>
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-900">{inspect.tour?.title}</p>
            <p className="text-xs text-slate-400">{inspect.user?.name}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{inspect.comment || '—'}</p>
            {Array.isArray(inspect.images) && inspect.images.length > 0 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {inspect.images.map((src, i) => (
                  <img key={`${inspect.id}-img-${i}`} src={src} alt="" loading="lazy" className="h-20 w-28 shrink-0 rounded-xl border border-slate-200 object-cover" />
                ))}
              </div>
            )}
            <p className="mt-2 text-xs tabular-nums text-slate-400">
              👍 {inspect.helpfulCount ?? 0}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => { void setHidden(inspect.id, !inspect.hidden); setInspect(null); }} className="text-orange-700 hover:bg-orange-50">
                {inspect.hidden ? t('adminReviews.unhide') : t('adminReviews.hide')}
              </Button>
              <Button variant="ghost" onClick={() => { setDeleteId(inspect.id); setInspect(null); }} className="text-red-600 hover:bg-red-50">
                {t('adminReviews.delete')}
              </Button>
              <Button variant="secondary" onClick={() => setInspect(null)}>{t('bookings.dialogCancel')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
