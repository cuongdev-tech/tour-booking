import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../services/api';
import { formatDateStr } from '../i18n/format';
import { formatCurrency, type Booking } from '../types';
import { Button, Card, EmptyState, Skeleton, StatusBadge } from '../components/ui/kit';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

export function Bookings() {
  const { t } = useTranslation();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  const load = () => {
    setLoading(true);
    api
      .get('/bookings/mine')
      .then((res) => setBookings(res.data.data))
      .catch(() => toast.error(t('bookings.loadFailed')))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const cancel = async (id: string) => {
    try {
      await api.patch(`/bookings/${id}/cancel`);
      toast.success(t('bookings.cancelled'));
      setConfirmId(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('bookings.cancelFailed')));
      setConfirmId(null);
    }
  };

  const openReview = (id: string) => {
    setReviewFor(id);
    setRating(5);
    setComment('');
  };

  const submitReview = async (bookingId: string) => {
    if (rating < 1 || rating > 5) return;
    setSubmittingReview(true);
    try {
      await api.post('/reviews', { bookingId, rating, comment: comment.trim() || undefined });
      toast.success(t('bookings.reviewSuccess'));
      setReviewedIds((prev) => new Set(prev).add(bookingId));
      setReviewFor(null);
    } catch (err) {
      toast.error(apiErrorMessage(err, t('bookings.reviewFailed')));
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-5xl space-y-4 px-4 py-10"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>;
  }
  if (bookings.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <EmptyState title={t('bookings.emptyTitle')} hint={t('bookings.emptyHint')} action={<Link to="/tours"><Button>{t('bookings.browseTours')}</Button></Link>} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-slate-900">{t('bookings.title', { count: bookings.length })}</h1>
      <div className="mt-6 space-y-4">
        {bookings.map((b) => (
          <Card key={b.id} className="flex flex-col gap-4 p-5 md:flex-row">
            <img src={b.tour?.images[0]} alt="" className="h-36 w-full rounded-xl object-cover md:w-52" />
            <div className="flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold tracking-widest text-teal-700">{b.bookingCode}</p>
                  <h3 className="mt-1 font-semibold text-slate-900">{b.tour?.title}</h3>
                </div>
                <div className="flex gap-2"><StatusBadge status={b.bookingStatus} /><StatusBadge status={b.payment?.status ?? 'PENDING'} /></div>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {formatDateStr(b.travelDate)} · {t('bookings.guestsSuffix', { count: b.guests })} · {formatCurrency(b.total)}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Link to={`/booking-success/${b.bookingCode}`}><Button variant="secondary">{t('bookings.details')}</Button></Link>
                {b.bookingStatus === 'COMPLETED' && !reviewedIds.has(b.id) && (
                  <Button variant="secondary" onClick={() => openReview(b.id)}>{t('bookings.writeReview')}</Button>
                )}
                {(b.bookingStatus === 'PENDING' || b.bookingStatus === 'CONFIRMED') && (
                  <Button variant="danger" onClick={() => setConfirmId(b.id)}>{t('bookings.cancel')}</Button>
                )}
              </div>
              {reviewFor === b.id && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-slate-900">{t('bookings.reviewTitle')}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-sm text-slate-600">{t('bookings.reviewRating')}</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setRating(n)}
                          aria-label={`${n} / 5`}
                          className={`text-2xl leading-none ${n <= rating ? 'text-amber-400' : 'text-slate-300'} hover:scale-110`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="mt-3 block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">{t('bookings.reviewComment')}</span>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder={t('bookings.reviewCommentPh')}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500"
                    />
                  </label>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setReviewFor(null)}>{t('bookings.dialogCancel')}</Button>
                    <Button disabled={submittingReview} onClick={() => void submitReview(b.id)}>{t('bookings.reviewSubmit')}</Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
      <ConfirmDialog
        open={confirmId !== null}
        title={t('bookings.dialogTitle')}
        message={t('bookings.dialogMessage')}
        confirmLabel={t('bookings.dialogConfirm')}
        cancelLabel={t('bookings.dialogCancel')}
        onClose={() => setConfirmId(null)}
        onConfirm={() => confirmId && void cancel(confirmId)}
      />
    </div>
  );
}
