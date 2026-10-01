import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../../services/api';
import type { Pagination, Review } from '../../types';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { AdminPagination } from './Pagination';

type Tab = 'all' | 'pending' | 'visible' | 'hidden';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'pending', label: 'Chờ duyệt' },
  { id: 'visible', label: 'Hiện' },
  { id: 'hidden', label: 'Ẩn' },
];

function formatTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function ReviewsManage() {
  const [tab, setTab] = useState<Tab>('all');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [counts, setCounts] = useState<{ total: number; pending: number; visible: number; hidden: number } | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);

  const loadCounts = () =>
    api
      .get('/admin/reviews/counts')
      .then((r) => setCounts(r.data))
      .catch(() => setCounts(null));

  const load = (t: Tab = tab, p: number = page) => {
    setLoading(true);
    const params: Record<string, unknown> = { page: p, limit: 10 };
    if (t !== 'all') params.tab = t;
    // visible/hidden backend hiểu qua tab; pending = đang hiện + chưa trả lời
    api
      .get('/admin/reviews', { params })
      .then((r) => {
        setReviews(r.data.data);
        setPagination(r.data.pagination);
      })
      .catch((err) => toast.error(apiErrorMessage(err, 'Không tải được đánh giá')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void loadCounts();
  }, []);
  useEffect(() => {
    void load(tab, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setPage(1);
  };

  const setHidden = async (id: string, hidden: boolean) => {
    try {
      await api.patch(`/admin/reviews/${id}`, { hidden });
      toast.success(hidden ? 'Đã ẩn đánh giá' : 'Đã duyệt/hiện đánh giá');
      await load();
      await loadCounts();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Cập nhật thất bại'));
    }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/admin/reviews/${id}`);
      toast.success('Đã xóa đánh giá');
      setDeleteId(null);
      await loadCounts();
      if (reviews.length === 1 && page > 1) setPage(page - 1);
      else await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Xóa thất bại'));
      setDeleteId(null);
    }
  };

  const sendReply = async (id: string) => {
    const text = (replies[id] ?? '').trim();
    if (!text) {
      toast.error('Vui lòng nhập nội dung trả lời');
      return;
    }
    setSending(id);
    try {
      await api.patch(`/admin/reviews/${id}/reply`, { reply: text });
      toast.success('Đã trả lời đánh giá');
      setReplies((prev) => ({ ...prev, [id]: '' }));
      await load();
      await loadCounts();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Trả lời thất bại'));
    } finally {
      setSending(null);
    }
  };

  const countFor = (t: Tab): number => {
    if (!counts) return 0;
    if (t === 'all') return counts.total;
    if (t === 'pending') return counts.pending;
    if (t === 'visible') return counts.visible;
    return counts.hidden;
  };

  return (
    <div className="min-w-0 antialiased">
      <h2 className="text-[22px] leading-7 font-extrabold tracking-tight text-neutral-900 uppercase">Duyệt đánh giá</h2>

      <div className="mt-3 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTab(t.id)}
              className={`inline-flex min-h-9 items-center rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
                active
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-300 bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-900'
              }`}
            >
              {t.label} ({countFor(t.id)})
            </button>
          );
        })}
      </div>

      <div className="mt-4 space-y-4">
        {loading && reviews.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-[13px] font-normal text-neutral-400 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            Đang tải đánh giá...
          </div>
        ) : reviews.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-[13px] font-normal text-neutral-400 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            Chưa có đánh giá nào trong mục này.
          </div>
        ) : null}
        {reviews.map((r) => (
          <article key={r.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-[14px] font-bold text-neutral-900">
                {r.user?.name ?? 'Khách'} — {r.rating} sao — {r.tour?.title ?? r.tourId}
              </p>
              <p className="text-[12px] font-normal whitespace-nowrap text-neutral-400 tabular-nums">
                {formatTime(r.createdAt)} | {r.hidden ? 'Ẩn' : 'Hiện'} | {r.helpfulCount ?? 0} hữu ích
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
                    className="h-16 w-24 shrink-0 rounded-xl border border-slate-200 object-cover"
                  />
                ))}
              </div>
            )}
            {r.adminReply && (
              <div className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm">
                <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">Phản hồi của bạn</p>
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
                  Duyệt/Hiện
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void setHidden(r.id, true)}
                  className="inline-flex min-h-9 items-center rounded-full border border-neutral-300 px-3 py-1.5 text-[12px] font-medium text-neutral-600 hover:bg-neutral-50"
                >
                  Ẩn
                </button>
              )}

              <input
                value={replies[r.id] ?? ''}
                onChange={(e) => setReplies((prev) => ({ ...prev, [r.id]: e.target.value }))}
                placeholder="Trả lời review..."
                aria-label="Trả lời review"
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
                {sending === r.id ? 'Đang gửi...' : 'Trả lời'}
              </button>
              <button
                type="button"
                onClick={() => setDeleteId(r.id)}
                className="inline-flex min-h-9 items-center rounded-full border border-red-400 px-3 py-1.5 text-[12px] font-medium text-red-500 hover:bg-red-50"
              >
                Xóa
              </button>
            </div>
          </article>
        ))}
      </div>

      <AdminPagination pagination={pagination} onPage={setPage} />
      <ConfirmDialog
        open={deleteId !== null}
        title="Xóa đánh giá?"
        message="Điểm tour sẽ được tính lại. Không thể hoàn tác."
        confirmLabel="Xóa"
        cancelLabel="Hủy"
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && void remove(deleteId)}
      />
    </div>
  );
}
