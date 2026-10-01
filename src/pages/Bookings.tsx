import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { CalendarDays, Download, Luggage, Users, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../services/api';
import { downloadInvoice } from '../services/invoice';
import { startOfTodayLocal, todayLocalInput } from '../utils/date';
import { useEnumLabels } from '../i18n/enums';
import { formatDateStr } from '../i18n/format';
import { formatCurrency, type Booking, type Review } from '../types';
import { Button, Card, EmptyState, Field, Input, Modal, PageContainer, QuantityStepper, RetryState, SafeImage, Skeleton, Stars, StatusBadge, Textarea } from '../components/ui/kit';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

export function Bookings() {
  const { t } = useTranslation();
  const labels = useEnumLabels();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reviewImages, setReviewImages] = useState<string[]>([]);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [myReviews, setMyReviews] = useState<Record<string, Review>>({});
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [deleteReviewId, setDeleteReviewId] = useState<string | null>(null);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editGuests, setEditGuests] = useState<Array<{ fullName: string; phone: string; email: string; isChild: boolean; dob: string }>>([]);
  const [editNote, setEditNote] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  useDocumentMeta(t('bookings.title', { count: bookings.length }));

  const todayStart = startOfTodayLocal();
  // Matches backend cancelBooking: upcoming PENDING/CONFIRMED bookings whose travel
  // day hasn't passed. Past tours can't be cancelled (server enforces this too).
  // Paid bookings past the tour's free-cancel deadline are also locked (admin only).
  const freeCancelOver = (b: Booking) => {
    const hours = b.tour?.freeCancelHours;
    if (hours == null || b.payment?.status !== 'PAID') return false;
    const travel = new Date(b.travelDate).getTime();
    if (Number.isNaN(travel)) return false;
    return Date.now() > travel - hours * 3600_000;
  };
  const canCancel = (b: Booking) =>
    (b.bookingStatus === 'PENDING' || b.bookingStatus === 'CONFIRMED') &&
    !Number.isNaN(new Date(b.travelDate).getTime()) &&
    new Date(b.travelDate).getTime() >= todayStart &&
    !freeCancelOver(b);

  const abortRef = useRef<AbortController | null>(null);

  const load = () => {
    // A newer load supersedes any in-flight one (rapid cancel/edit sequences).
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setLoadFailed(false);
    Promise.all([
      api.get('/bookings/mine', { signal: ctrl.signal }).then((res) => setBookings(res.data.data)),
      api.get('/reviews/mine', { signal: ctrl.signal }).then((res) => {
        const map: Record<string, Review> = {};
        for (const r of res.data.data as Review[]) map[r.bookingId] = r;
        setMyReviews(map);
      }),
    ])
      .catch((err) => {
        if (axios.isAxiosError(err) && err.code === 'ERR_CANCELED') return;
        setLoadFailed(true);
        toast.error(apiErrorMessage(err, t('bookings.loadFailed')));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
  };
  useEffect(load, []);
  useEffect(() => () => abortRef.current?.abort(), []);

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

  // Khách báo "đã chuyển khoản" (chỉ BANK_TRANSFER): backend chuyển payment
  // sang AWAITING_CONFIRMATION để chuông admin reo và chờ đối chiếu sao kê.
  const claimTransfer = async (id: string) => {
    setClaimingId(id);
    try {
      await api.patch(`/bookings/${id}/confirm-transfer`);
      toast.success(t('pay.claimed', { defaultValue: 'Đã ghi nhận, chờ shop xác nhận nhé!' }) as string);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('checkout.bookingFailed')));
    } finally {
      setClaimingId(null);
    }
  };

  const openReview = (id: string, existing?: Review) => {
    setReviewFor(id);
    setEditingReview(existing ?? null);
    setRating(existing?.rating ?? 5);
    setComment(existing?.comment ?? '');
    setReviewImages(Array.isArray(existing?.images) ? existing.images.slice(0, 3) : []);
  };

  // Review photos: device files converted to dataURL (≤700KB each, max 3 —
  // backend accepts URLs or data-images and re-validates).
  const addReviewFiles = async (files: FileList | null) => {
    if (!files) return;
    const slots = 3 - reviewImages.length;
    if (slots <= 0) {
      toast.error(apiErrorMessage(null, t('bookings.reviewFailed')));
      return;
    }
    const picked = Array.from(files).slice(0, slots);
    for (const f of picked) {
      if (!f.type.startsWith('image/') || f.size > 700_000) {
        toast.error(apiErrorMessage(null, t('bookings.reviewFailed')));
        continue;
      }
      const data: string = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(f);
      }).catch(() => '');
      if (data) setReviewImages((prev) => (prev.length < 3 ? [...prev, data] : prev));
    }
  };

  const submitReview = async (bookingId: string) => {
    if (rating < 1 || rating > 5) return;
    setSubmittingReview(true);
    try {
      if (editingReview) {
        const { data } = await api.patch(`/reviews/${editingReview.id}`, {
          rating,
          comment: comment.trim() || null,
          images: reviewImages,
        });
        toast.success(t('bookings.reviewUpdated'));
        setMyReviews((prev) => ({ ...prev, [bookingId]: data.review }));
      } else {
        const { data } = await api.post('/reviews', { bookingId, rating, comment: comment.trim() || undefined, images: reviewImages });
        toast.success(t('bookings.reviewSuccess'));
        setReviewedIds((prev) => new Set(prev).add(bookingId));
        setMyReviews((prev) => ({ ...prev, [bookingId]: data.review }));
      }
      setEditingReview(null);
      setReviewFor(null);
      setReviewImages([]);
    } catch (err) {
      toast.error(apiErrorMessage(err, t('bookings.reviewFailed')));
    } finally {
      setSubmittingReview(false);
    }
  };

  const removeReview = async (reviewId: string, bookingId: string) => {
    try {
      await api.delete(`/reviews/${reviewId}`);
      toast.success(t('bookings.reviewDeleted'));
      setDeleteReviewId(null);
      setReviewedIds((prev) => {
        const next = new Set(prev);
        next.delete(bookingId);
        return next;
      });
      setMyReviews((prev) => {
        const next = { ...prev };
        delete next[bookingId];
        return next;
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, t('bookings.reviewFailed')));
      setDeleteReviewId(null);
    }
  };

  const canModify = (b: Booking) => canCancel(b) && (b.payment?.status ?? 'PENDING') === 'PENDING';

  const openEdit = (b: Booking) => {
    setEditBooking(b);
    setEditDate(b.travelDate.slice(0, 10));
    const names = b.guestsList ?? [];
    setEditGuests(
      Array.from({ length: b.guests }, (_, i) => ({
        fullName: names[i]?.fullName ?? '',
        phone: names[i]?.phone ?? '',
        email: names[i]?.email ?? '',
        // Preserve ticket types (backend reprices NL/TE fares on edit).
        isChild: names[i]?.isChild ?? false,
        dob: names[i]?.dateOfBirth?.slice(0, 10) ?? '',
      })),
    );
    setEditNote(b.note ?? '');
  };

  const setEditCount = (n: number) => {
    setEditGuests((prev) =>
      prev.length < n
        ? [...prev, ...Array.from({ length: n - prev.length }, () => ({ fullName: '', phone: '', email: '', isChild: false, dob: '' }))]
        : prev.slice(0, n),
    );
  };

  const submitEdit = async () => {
    if (!editBooking) return;
    const day = new Date(editDate);
    // Client-side guardrails mirror the backend (which re-validates everything):
    // a valid future date plus a named traveler per seat.
    if (!editDate || Number.isNaN(day.getTime()) || day.getTime() < todayStart) {
      toast.error(apiErrorMessage(null, t('checkout.missingInfo')));
      return;
    }
    if (editGuests.length < 1 || editGuests.some((g) => g.fullName.trim().length < 2)) {
      toast.error(apiErrorMessage(null, t('validation.guestNameRequired')));
      return;
    }
    // Child rows must carry a birth date (backend verifies age vs childMaxAge).
    if (editGuests.some((g) => g.isChild && (!g.dob || Number.isNaN(Date.parse(g.dob))))) {
      toast.error(apiErrorMessage(null, t('validation.childDobRequired')));
      return;
    }
    const limits = editBooking.tour;
    if (limits && (editGuests.length < limits.minGuests || editGuests.length > limits.maxGuests)) {
      toast.error(
        apiErrorMessage(null, t('tourDetails.guestsRange', { min: limits.minGuests, max: limits.maxGuests })),
      );
      return;
    }
    setSubmittingEdit(true);
    try {
      await api.patch(`/bookings/${editBooking.id}`, {
        travelDate: day.toISOString(),
        guestsList: editGuests.map((g) => ({
          fullName: g.fullName.trim(),
          isChild: g.isChild,
          dateOfBirth: g.dob || undefined,
          phone: g.phone.trim() || undefined,
          email: g.email.trim() || undefined,
        })),
        note: editNote.trim() || null,
      });
      toast.success(t('bookings.modifySuccess'));
      setEditBooking(null);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('bookings.modifyFailed')));
    } finally {
      setSubmittingEdit(false);
    }
  };

  if (loading) {
    return <PageContainer className="max-w-5xl py-10"><div className="space-y-4"><Skeleton className="h-36" /><Skeleton className="h-36" /></div></PageContainer>;
  }
  if (loadFailed && bookings.length === 0) {
    return (
      <PageContainer className="max-w-5xl py-10">
        <RetryState title={t('bookings.loadFailed')} onRetry={load} retryLabel={t('tours.retry')} />
      </PageContainer>
    );
  }
  if (bookings.length === 0) {
    return (
      <PageContainer className="max-w-5xl py-10">
        <EmptyState
          icon={<Luggage className="h-6 w-6" aria-hidden />}
          title={t('bookings.emptyTitle')}
          hint={t('bookings.emptyHint')}
          action={<Link to="/tours"><Button>{t('bookings.browseTours')}</Button></Link>}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-5xl py-8 md:py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{t('bookings.title', { count: bookings.length })}</h1>
      <div className="mt-6 space-y-4">
        {bookings.map((b) => (
          <Card key={b.id} className="flex flex-col gap-4 p-4 sm:p-5 md:flex-row">
            <Link to={`/tour/${b.tourId}`} className="shrink-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700" tabIndex={-1} aria-hidden>
              <SafeImage src={b.tour?.images[0]} alt="" className="h-36 w-full rounded-xl object-cover md:w-52" />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold tabular-nums tracking-widest text-orange-700">{b.bookingCode}</p>
                  <h3 className="mt-1 font-semibold leading-snug text-slate-900">{b.tour?.title}</h3>
                </div>
                <div className="flex flex-wrap gap-1.5"><StatusBadge status={b.bookingStatus} /><StatusBadge status={b.payment?.status ?? 'PENDING'} /></div>
              </div>
              <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-500">
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-slate-400" aria-hidden />{formatDateStr(b.travelDate)}</span>
                <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-slate-400" aria-hidden />{t('bookings.guestsSuffix', { count: b.guests })}{(b.children ?? 0) > 0 && ` (${b.adults ?? b.guests - (b.children ?? 0)} NL · ${b.children} TE)`}</span>
                <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums text-slate-900"><Wallet className="h-4 w-4 text-slate-400" aria-hidden />{formatCurrency(b.total)}</span>
              </dl>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Link to={`/booking-success/${b.bookingCode}`}><Button variant="secondary">{t('bookings.details')}</Button></Link>
                <Button
                  variant="secondary"
                  isLoading={invoiceId === b.id}
                  onClick={() => {
                    setInvoiceId(b.id);
                    downloadInvoice(b, {
                      bookingStatus: labels.bookingStatus(b.bookingStatus),
                      paymentStatus: labels.paymentStatus(b.payment?.status ?? 'PENDING'),
                    })
                      .catch((err) => toast.error(apiErrorMessage(err, t('tours.loadError'))))
                      .finally(() => setInvoiceId(null));
                  }}
                >
                  {invoiceId === b.id ? null : <Download className="h-4 w-4" aria-hidden />}
                  {t('bookings.invoice')}
                </Button>
                {canModify(b) && (
                  <Button variant="outline" onClick={() => openEdit(b)}>{t('bookings.modify')}</Button>
                )}
                {b.payment?.method === 'BANK_TRANSFER' &&
                  (b.payment?.status === 'PENDING' || b.payment?.status === 'FAILED') &&
                  (b.bookingStatus === 'PENDING' || b.bookingStatus === 'CONFIRMED') && (
                  <Button variant="secondary" isLoading={claimingId === b.id} onClick={() => void claimTransfer(b.id)}>
                    {t('pay.claimedBtn', { defaultValue: 'Tôi đã chuyển khoản' }) as string}
                  </Button>
                )}
                {/* Mirror of the backend rule: reviews only for finished trips
                    (COMPLETED status + travel day already passed). */}
                {b.bookingStatus === 'COMPLETED' && new Date(b.travelDate).getTime() <= Date.now() && !reviewedIds.has(b.id) && !myReviews[b.id] && (
                  <Button variant="outline" onClick={() => openReview(b.id)}>{t('bookings.writeReview')}</Button>
                )}
                {canCancel(b) && (
                  <Button variant="danger" onClick={() => setConfirmId(b.id)}>{t('bookings.cancel')}</Button>
                )}
              </div>
              {reviewFor === b.id ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-slate-900">{t('bookings.reviewTitle')}</p>
                  <div className="mt-2.5 flex items-center gap-2.5">
                    <span className="text-sm text-slate-600">{t('bookings.reviewRating')}</span>
                    <div className="flex gap-0.5" role="radiogroup" aria-label={t('bookings.reviewRating')}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={n === rating}
                          onClick={() => setRating(n)}
                          aria-label={`${n} / 5`}
                          className={`flex h-11 w-11 items-center justify-center rounded-lg text-2xl leading-none transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 enabled:active:scale-95 ${n <= rating ? 'text-amber-400' : 'text-slate-300 hover:bg-slate-100 hover:text-slate-400'}`}
                        >
                          <span aria-hidden>★</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="mt-3 block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">{t('bookings.reviewComment')}</span>
                    <Textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder={t('bookings.reviewCommentPh')}
                    />
                  </label>
                  <div className="mt-3">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      {t('bookings.reviewPhotos', { defaultValue: 'Ảnh (tối đa 3)' }) as string}
                    </span>
                    {reviewImages.length > 0 && (
                      <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                        {reviewImages.map((src, i) => (
                          <span key={`${i}-${src.slice(0, 24)}`} className="relative shrink-0">
                            <img src={src} alt="" className="h-20 w-28 rounded-xl border border-slate-200 object-cover" />
                            <button
                              type="button"
                              onClick={() => setReviewImages((prev) => prev.filter((_, j) => j !== i))}
                              aria-label={t('bookings.deleteReview')}
                              className="absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs text-white shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                            >
                              <span aria-hidden>×</span>
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {reviewImages.length < 3 && (
                      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:border-orange-300 hover:text-slate-900 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-orange-700">
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="sr-only"
                          onChange={(e) => {
                            void addReviewFiles(e.target.files);
                            e.target.value = '';
                          }}
                        />
                        + {t('bookings.addPhotos', { defaultValue: 'Thêm ảnh' }) as string}
                      </label>
                    )}
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => { setReviewFor(null); setEditingReview(null); setReviewImages([]); }}>{t('bookings.dialogCancel')}</Button>
                    <Button isLoading={submittingReview} onClick={() => void submitReview(b.id)}>{t('bookings.reviewSubmit')}</Button>
                  </div>
                </div>
              ) : myReviews[b.id] ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Stars value={myReviews[b.id].rating} />
                    <span className="flex gap-2">
                      <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => openReview(b.id, myReviews[b.id])}>
                        {t('bookings.editReview')}
                      </Button>
                      <Button variant="ghost" className="px-3 py-2 text-xs text-red-600 hover:bg-red-50" onClick={() => setDeleteReviewId(myReviews[b.id].id)}>
                        {t('bookings.deleteReview')}
                      </Button>
                    </span>
                  </div>
                  {myReviews[b.id].comment && (
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{myReviews[b.id].comment}</p>
                  )}
                  {Array.isArray(myReviews[b.id].images) && myReviews[b.id].images.length > 0 && (
                    <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                      {myReviews[b.id].images.map((src, i) => (
                        <img key={`${myReviews[b.id].id}-img-${i}`} src={src} alt="" loading="lazy" className="h-16 w-24 shrink-0 rounded-lg border border-slate-200 object-cover" />
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
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
      <ConfirmDialog
        open={deleteReviewId !== null}
        title={t('bookings.deleteReviewTitle')}
        message={t('bookings.deleteReviewMessage')}
        confirmLabel={t('bookings.deleteReview')}
        cancelLabel={t('bookings.dialogCancel')}
        onClose={() => setDeleteReviewId(null)}
        onConfirm={() => {
          const entry = Object.entries(myReviews).find(([, r]) => r.id === deleteReviewId);
          if (deleteReviewId && entry) void removeReview(deleteReviewId, entry[0]);
          else setDeleteReviewId(null);
        }}
      />
      <Modal open={editBooking !== null} onClose={() => setEditBooking(null)} label={t('bookings.modify')} wide>
        {editBooking && (
          <div>
            <h3 className="text-lg font-bold tracking-tight text-slate-900">{t('bookings.modify')}</h3>
            <p className="mt-1 truncate text-sm text-slate-500">{editBooking.tour?.title}</p>
            <div className="mt-4 space-y-4">
              <Field label={t('tourDetails.travelDate')}>
                <Input type="date" value={editDate} min={todayLocalInput()} onChange={(e) => setEditDate(e.target.value)} />
              </Field>
              <div>
                <span id="edit-guests-label" className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t('tourDetails.guests')}
                </span>
                <QuantityStepper
                  value={editGuests.length}
                  min={editBooking?.tour ? Math.max(1, editBooking.tour.minGuests) : 1}
                  max={(() => {
                    const tour = editBooking?.tour;
                    if (!tour) return 100;
                    // Global seats were already decremented by this booking, so the
                    // user can grow back up to (remaining + current) without overselling.
                    const seatCeiling = Math.max(0, tour.availableSeats) + editBooking.guests;
                    return Math.max(
                      tour.minGuests,
                      Math.min(100, tour.maxGuests, seatCeiling),
                    );
                  })()}
                  onChange={setEditCount}
                  decreaseLabel={t('tourDetails.decreaseGuests')}
                  increaseLabel={t('tourDetails.increaseGuests')}
                  labelledBy="edit-guests-label"
                />
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {editGuests.map((g, i) => (
                    <div key={i}>
                      <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <Field label={t('checkout.travelerName', { index: i + 1 })}>
                          <Input
                            value={g.fullName}
                            onChange={(e) =>
                              setEditGuests((prev) => prev.map((x, j) => (j === i ? { ...x, fullName: e.target.value } : x)))
                            }
                            placeholder={t('checkout.fullName')}
                            autoComplete="off"
                          />
                        </Field>
                      </div>
                      {/* Ticket type is fixed at booking time (backend reprices accordingly). */}
                      <span className={`mt-7 shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${g.isChild ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-600'}`}>
                        {g.isChild
                          ? (t('tourDetails.children', { defaultValue: 'Trẻ em' }) as string)
                          : (t('tourDetails.adults', { defaultValue: 'Người lớn' }) as string)}
                      </span>
                      </div>
                      {g.isChild && (
                        <div className="mt-2">
                          <Field label={t('bookings.childDob', { defaultValue: 'Ngày sinh của trẻ' }) as string}>
                            <Input
                              type="date"
                              value={g.dob}
                              max={todayLocalInput()}
                              onChange={(e) =>
                                setEditGuests((prev) => prev.map((x, j) => (j === i ? { ...x, dob: e.target.value } : x)))
                              }
                            />
                          </Field>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <Field label={t('checkout.note')}>
                <Input value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder={t('checkout.notePlaceholder')} />
              </Field>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditBooking(null)}>{t('bookings.dialogCancel')}</Button>
              <Button isLoading={submittingEdit} onClick={() => void submitEdit()}>{t('common.save')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
}
