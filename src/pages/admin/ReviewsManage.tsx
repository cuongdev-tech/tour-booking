import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../../services/api';
import { formatDateTimeStr } from '../../i18n/format';
import type { Pagination, Review } from '../../types';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { AdminPagination } from './Pagination';

type Tab = 'all' | 'pending' | 'visible' | 'hidden';

export function ReviewsManage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('all');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [counts, setCounts] = useState<{ total: number; pending: number; visible: number; hidden: number } | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'all', label: t('adminReviews.all') as string },
    { id: 'pending', label: t('adminReviews.pending') as string },
    { id: 'visible', label: t('adminReviews.visibleTab') as string },
    { id: 'hidden', label: t('adminReviews.hidden') as string },
  ];

  const loadCounts = () =>
    api
      .get('/admin/reviews/counts')
      .then((r) => setCounts(r.data))
      .catch(() => setCounts(null));

  const load = (tabId: Tab = tab, p: number = page) => {
    setLoading(true);
    const params: Record<string, unknown> = { page: p, limit: 10 };
    if (tabId !== 'all') params.tab = tabId;
    // visible/hidden backend hiểu qua tab; pending = đang hiện + chưa trả lời
    api
      .get('/admin/reviews', { params })
      .then((r) => {
        setReviews(r.data.data);
        setPagination(r.data.pagination);
      })
      .catch((err) => toast.error(apiErrorMessage(err, t('adminReviews.loadFailed') as string)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void loadCounts();
  }, []);
  useEffect(() => {
    void load(tab, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page]);

  const switchTab = (next: Tab) => {
    setTab(next);
    setPage(1);
  };

  const setHidden = async (id: string, hidden: boolean) => {
    try {
      await api.patch(`/admin/reviews/${id}`, { hidden });
      toast.success(t(hidden ? 'adminReviews.hiddenOk' : 'adminReviews.approvedOk') as string);
      await load();
      await loadCounts();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('adminReviews.updateFailed') as string));
    }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/admin/reviews/${id}`);
      toast.success(t('adminReviews.deleted') as string);
      setDeleteId(null);
      await loadCounts();
      if (reviews.length === 1 && page > 1) setPage(page - 1);
      else await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('adminReviews.deleteFailed') as string));
      setDeleteId(null);
    }
  };

  const sendReply = async (id: string) => {
    const text = (replies[id] ?? '').trim();
    if (!text) {
      toast.error(t('adminReviews.replyRequired') as string);
      return;
    }
    setSending(id);
    try {
      await api.patch(`/admin/reviews/${id}/reply`, { reply: text });
      toast.success(t('adminReviews.replySent') as string);
      setReplies((prev) => ({ ...prev, [id]: '' }));
      await load();
      await loadCounts();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('adminReviews.replyFailed') as string));
    } finally {
      setSending(null);
    }
  };

  const countFor = (tabId: Tab): number => {
    if (!counts) return 0;
    if (tabId === 'all') return counts.total;
    if (tabId === 'pending') return counts.pending;
    if (tabId === 'visible') return counts.visible;
    return counts.hidden;
  };

  return (
    <div className="min-w-0 antialiased">
      <h2 className="text-[22px] leading-7 font-extrabold tracking-tight text-neutral-900 uppercase">{t('adminReviews.title')}</h2>

      <div className="mt-3 flex flex-wrap gap-2">
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => switchTab(item.id)}
              className={`inline-flex min-h-9 items-center rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
                active
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-300 bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-900'
              }`}
            >
              {item.label} ({countFor(item.id)})
            </button>
          );
        })}
      </div>

      <div className="mt-4 space-y-4">
        {loading && reviews.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-[13px] font-normal text-neutral-400 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {t('adminReviews.loading')}
          </div>
        ) : reviews.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-[13px] font-normal text-neutral-400 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {t('adminReviews.empty')}
          </div>
        ) : null}
        {reviews.map((r) => (
          <article key={r.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-[14px] font-bold text-neutral-900">
                {r.user?.name ?? (t('tourDetails.travelerDefault') as string)} — {t('adminReviews.stars', { count: r.rating })} — {r.tour?.title ?? r.tourId}
              </p>
              <p className="text-[12px] font-normal whitespace-nowrap text-neutral-400 tabular-nums">
                {formatDateTimeStr(r.createdAt)} | {r.hidden ? (t('adminReviews.hidden') as string) : (t('adminReviews.visibleTab') as string)} | {t('adminReviews.helpful', { count: r.helpfulCount ?? 0 })}
              </p>
            </div>
            <p className="mt-2 text-[13px] font-normal text-neutral-600">{r.comment || '—'}</p>
            {Array.isArray(r.images) && r.images.length > 0 && (
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {r.images.map((src, i) => (
                  <img
                    key={`${r.id}-img-${i}`}
                    src={src}
                    alt=""
                    loading="lazy"
                    className="h-16 w-24 shrink-0 rounded-xl border border-neutral-200 object-cover"
                  />
                ))}
              </div>
            )}
            {r.adminReply && (
              <div className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm">
                <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{t('adminReviews.myReply')}</p>
                <p className="mt-1 text-[13px] font-normal text-neutral-700">{r.adminReply}</p>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {r.hidden ? (
                <button
                  type="button"
                  onClick={() => void setHidden(r.id, false)}
                  className="inline-flex min-h-9 items-center rounded-full bg-emerald-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-emerald-700"
                >
                  {t('adminReviews.unhide')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void setHidden(r.id, true)}
                  className="inline-flex min-h-9 items-center rounded-full border border-neutral-300 px-3 py-1.5 text-[12px] font-medium text-neutral-600 hover:bg-neutral-50"
                >
                  {t('adminReviews.hide')}
                </button>
              )}

              <input
                value={replies[r.id] ?? ''}
                onChange={(e) => setReplies((prev) => ({ ...prev, [r.id]: e.target.value }))}
                placeholder={t('adminReviews.replyPh') as string}
                aria-label={t('adminReviews.replyPh') as string}
                className="min-h-10 min-w-40 flex-1 rounded-lg border border-neutral-200 px-3.5 text-[13px] font-normal outline-none placeholder:text-neutral-400 focus:border-neutral-900"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void sendReply(r.id);
                }}
              />
              <button
                type="button"
                onClick={() => void sendReply(r.id)}
                disabled={sending === r.id}
                className="inline-flex min-h-10 items-center rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-neutral-700 disabled:opacity-50"
              >
                {sending === r.id ? t('adminReviews.sending') : t('adminReviews.replyBtn')}
              </button>
              <button
                type="button"
                onClick={() => setDeleteId(r.id)}
                className="inline-flex min-h-9 items-center rounded-full border border-red-400 px-3 py-1.5 text-[12px] font-medium text-red-500 hover:bg-red-50"
              >
                {t('adminReviews.delete')}
              </button>
            </div>
          </article>
        ))}
      </div>

      <AdminPagination pagination={pagination} onPage={setPage} />
      <ConfirmDialog
        open={deleteId !== null}
        title={t('adminReviews.deleteTitle') as string}
        message={t('adminReviews.deleteMessage') as string}
        confirmLabel={t('adminReviews.delete') as string}
        cancelLabel={t('common.cancel') as string}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && void remove(deleteId)}
      />
    </div>
  );
}
