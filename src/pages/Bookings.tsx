import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { CalendarDays, Download, Luggage, Users, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../services/api';
import { downloadInvoice } from '../services/invoice';
import { startOfTodayUtc, todayLocalInput, todayUtcInput, toLocalDateInput, toUtcDay } from '../utils/date';
import { useEnumLabels } from '../i18n/enums';
import { formatDateStr } from '../i18n/format';
import { formatCurrency, type Booking, type Review } from '../types';
import { Button, Card, EmptyState, Field, Input, Modal, PageContainer, QuantityStepper, RetryState, SafeImage, Skeleton, Stars, StatusBadge, Textarea } from '../components/ui/kit';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

type BookingWithSig = Booking & { ticketSignature?: string | null; checkedInAt?: string | null };

interface BookingMessage {
  id: string;
  body: string;
  senderRole: string;
  sender: { id: string; name: string };
  createdAt: string;
}

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
  const [editAvail, setEditAvail] = useState<{ managed: boolean; remaining: number | null } | null>(null);
  const [editAvailLoading, setEditAvailLoading] = useState(false);
  const [editGuests, setEditGuests] = useState<Array<{ fullName: string; phone: string; email: string; isChild: boolean; dob: string }>>([]);
  const [editNote, setEditNote] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [supportFor, setSupportFor] = useState<Booking | null>(null);
  const [messages, setMessages] = useState<BookingMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgBody, setMsgBody] = useState('');
  const [msgSending, setMsgSending] = useState(false);
  useDocumentMeta(t('bookings.title', { count: bookings.length }));

  const todayStart = startOfTodayUtc();
  // Matches backend cancelBooking (UTC calendar-day frame): upcoming
  // PENDING/CONFIRMED bookings whose travel day hasn't passed. Past tours can't
  // be cancelled (server enforces this too).
  // Paid bookings past the tour's free-cancel deadline are also locked (admin only).
  const freeCancelOver = (b: Booking) => {
    const hours = b.tour?.freeCancelHours;
    if (hours == null || b.payment?.status !== 'PAID') return false;
    const travel = new Date(b.travelDate).getTime();
    if (Number.isNaN(travel)) return false;
    return Date.now() > travel - hours * 3600_000;
  };
  const travelDayOk = (b: Booking) => {
    const day = toUtcDay(b.travelDate);
    return !Number.isNaN(day) && day >= todayStart;
  };
  const cancelLockedReason = (b: Booking): 'past' | 'deadline' | null => {
    if (b.bookingStatus !== 'PENDING' && b.bookingStatus !== 'CONFIRMED') return null;
    if (!travelDayOk(b)) return 'past';
    if (freeCancelOver(b)) return 'deadline';
    return null;
  };
  const canCancel = (b: Booking) =>
    (b.bookingStatus === 'PENDING' || b.bookingStatus === 'CONFIRMED') &&
    travelDayOk(b) &&
    !freeCancelOver(b);
  // Dòng chính sách hủy client-side (mirror BE getCancelPolicy): null = free
  // linh hoạt; unpaid luôn free (chưa thu tiền thì không có gì để mất).
  const cancelPolicyText = (b: Booking): string => {
    const hours = b.tour?.freeCancelHours;
    if (hours == null) {
      return t('tourDetails.freeCancelFlexible', { defaultValue: 'Hủy miễn phí linh hoạt' }) as string;
    }
    const travel = new Date(b.travelDate).getTime();
    if (Number.isNaN(travel)) {
      return t('tourDetails.freeCancelHoursShort', { defaultValue: 'Hủy miễn phí trước {{hours}} giờ khởi hành', hours }) as string;
    }
    const deadline = new Date(travel - hours * 3600_000);
    const paid = b.payment?.status === 'PAID';
    if (!paid) {
      return t('bookings.freeCancelUnpaid', { defaultValue: 'Hủy miễn phí linh hoạt (chưa thanh toán)' }) as string;
    }
    if (Date.now() <= deadline.getTime()) {
      return t('tourDetails.freeCancelUntil', { defaultValue: 'Hủy miễn phí đến {{date}}', date: formatDateStr(deadline.toISOString()) }) as string;
    }
    return t('bookings.freeCancelEnded', { defaultValue: 'Đã hết hạn hủy miễn phí' }) as string;
  };
  // Số tiền hoàn mirror BE (cancel → PAID thành REFUNDED): chỉ hoàn khi đã trả
  // và còn trong hạn hủy miễn phí.
  const refundOf = (b: Booking): number => {
    if (b.payment?.status !== 'PAID') return 0;
    const hours = b.tour?.freeCancelHours;
    if (hours == null) return b.total;
    const travel = new Date(b.travelDate).getTime();
    if (Number.isNaN(travel)) return 0;
    return Date.now() <= travel - hours * 3600_000 ? b.total : 0;
  };
  const verifyUrlOf = (b: Booking): string | null => {
    const usable =
      b.bookingStatus !== 'CANCELLED' &&
      (b.payment?.status === 'PAID' || b.payment?.method === 'CASH');
    if (!usable) return null;
    const sig = (b as BookingWithSig).ticketSignature;
    const base = `${window.location.origin}/verify/${b.bookingCode}`;
    return sig ? `${base}?t=${encodeURIComponent(sig)}` : base;
  };
  const missingSig = (b: Booking): boolean => {
    const usable =
      b.bookingStatus !== 'CANCELLED' &&
      (b.payment?.status === 'PAID' || b.payment?.method === 'CASH');
    return usable && !(b as BookingWithSig).ticketSignature;
  };
  const modifyLockedReason = (b: Booking): 'paid' | 'processing' | 'locked' | null => {
    if (!canCancel(b)) return 'locked';
    const st = b.payment?.status ?? 'PENDING';
    if (st === 'PAID') return 'paid';
    // PENDING + FAILED are editable (no money captured); AWAITING is locked.
    if (st !== 'PENDING' && st !== 'FAILED') return 'processing';
    return null;
  };

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

  const loadMessages = async (bookingId: string, silent = false) => {
    if (!silent) setMsgLoading(true);
    try {
      const { data } = await api.get(`/bookings/${bookingId}/messages`);
      setMessages(data.data ?? []);
    } catch {
      if (!silent) toast.error(apiErrorMessage(null, t('bookings.loadFailed')));
    } finally {
      if (!silent) setMsgLoading(false);
    }
  };

  const openSupport = (b: Booking) => {
    setSupportFor(b);
    setMessages([]);
    setMsgBody('');
    void loadMessages(b.id);
  };

  const sendMessage = async () => {
    if (!supportFor) return;
    const body = msgBody.trim();
    if (!body) return;
    setMsgSending(true);
    try {
      const { data } = await api.post(`/bookings/${supportFor.id}/messages`, { body });
      if (data.message) setMessages((prev) => [...prev, data.message]);
      else await loadMessages(supportFor.id, true);
      setMsgBody('');
    } catch (err) {
      toast.error(apiErrorMessage(err, t('bookings.sendFailed', { defaultValue: 'Gửi tin nhắn thất bại' }) as string));
    } finally {
      setMsgSending(false);
    }
  };

  // Poll tin nhắn mỗi 15s khi modal hỗ trợ đang mở.
  useEffect(() => {
    if (!supportFor) return;
    const id = window.setInterval(() => {
      void loadMessages(supportFor.id, true);
    }, 15000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportFor?.id]);

  const openReview = (id: string, existing?: Review) => {
    setReviewFor(id);
    setEditingReview(existing ?? null);
    setRating(existing?.rating ?? 5);
    setComment(existing?.comment ?? '');
    setReviewImages(Array.isArray(existing?.images) ? existing.images.slice(0, 3) : []);
    setReviewVideo(Array.isArray(existing?.videos) && existing.videos[0] ? existing.videos[0] : '');
  };

  // Review photos: device files converted to dataURL (≤700KB each, max 3 —
  // backend accepts URLs or data-images and re-validates).
  // Review video: URL only (max 1, no base64 — too heavy), e.g. YouTube/mp4 link.
  const [reviewVideo, setReviewVideo] = useState('');
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
    const videoUrl = reviewVideo.trim();
    if (videoUrl && !/^https?:\/\/.{4,500}$/.test(videoUrl)) {
      toast.error(apiErrorMessage(null, t('bookings.reviewFailed')));
      return;
    }
    const videos = videoUrl ? [videoUrl] : [];
    setSubmittingReview(true);
    try {
      if (editingReview) {
        const { data } = await api.patch(`/reviews/${editingReview.id}`, {
          rating,
          comment: comment.trim() || null,
          images: reviewImages,
          videos,
        });
        toast.success(t('bookings.reviewUpdated'));
        setMyReviews((prev) => ({ ...prev, [bookingId]: data.review }));
      } else {
        const { data } = await api.post('/reviews', { bookingId, rating, comment: comment.trim() || undefined, images: reviewImages, videos });
        toast.success(t('bookings.reviewSuccess'));
        setReviewedIds((prev) => new Set(prev).add(bookingId));
        setMyReviews((prev) => ({ ...prev, [bookingId]: data.review }));
      }
      setEditingReview(null);
      setReviewFor(null);
      setReviewImages([]);
      setReviewVideo('');
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

  const canModify = (b: Booking) => {
    if (!canCancel(b)) return false;
    const st = b.payment?.status ?? 'PENDING';
    return st === 'PENDING' || st === 'FAILED';
  };

  const openEdit = (b: Booking) => {
    setEditBooking(b);
    setEditDate(toLocalDateInput(b.travelDate));
    setEditAvail(null);
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

  // Per-date bucket for the edited day: the new day must fit the new party.
  // Same-day edits keep their own seats (remaining + current guests).
  useEffect(() => {
    if (!editBooking || !editDate || Number.isNaN(Date.parse(editDate))) {
      setEditAvail(null);
      setEditAvailLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setEditAvail(null);
    setEditAvailLoading(true);
    api
      .get(`/tours/${editBooking.tourId}/availability`, { params: { date: editDate }, signal: ctrl.signal })
      .then((r) => setEditAvail({ managed: r.data.managed, remaining: r.data.remaining }))
      .catch(() => {
        // Assume an open date on failure (backend enforces the real bucket).
        if (!ctrl.signal.aborted) setEditAvail({ managed: false, remaining: null });
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setEditAvailLoading(false);
      });
    return () => ctrl.abort();
  }, [editBooking, editDate]);

  const editSeatCap = (() => {
    if (!editBooking) return 100;
    const tour = editBooking.tour;
    const globalCap = Math.max(0, tour?.availableSeats ?? 0) + editBooking.guests;
    if (!editAvail || editAvail.managed !== true || editAvail.remaining == null) return globalCap;
    const sameDay = toLocalDateInput(editBooking.travelDate) === editDate;
    return editAvail.remaining + (sameDay ? editBooking.guests : 0);
  })();
  const editUnknown = editBooking !== null && editDate !== '' && !Number.isNaN(Date.parse(editDate)) && editAvail === null;

  const submitEdit = async () => {
    if (!editBooking) return;
    const day = new Date(editDate);
    // Client-side guardrails mirror the backend (which re-validates everything):
    // a valid future date (UTC frame) plus a named traveler per seat.
    if (!editDate || Number.isNaN(day.getTime()) || toUtcDay(editDate) < todayStart) {
      toast.error(apiErrorMessage(null, t('checkout.missingInfo')));
      return;
    }
    if (editUnknown || editAvailLoading) {
      toast.error(apiErrorMessage(null, t('tours.loadError')));
      return;
    }
    if (editGuests.length > editSeatCap) {
      toast.error(
        apiErrorMessage(null, t('backendErrors.dateSoldOut')),
      );
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
              <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs leading-relaxed text-emerald-700">
                {cancelPolicyText(b)}
              </p>
              {b.comboGroup && (b.bookingStatus === 'PENDING' || b.bookingStatus === 'CONFIRMED') && (
                <p className="mt-2 rounded-lg bg-orange-50 px-3 py-1.5 text-xs leading-relaxed text-orange-700">
                  {t('bookings.comboLegNote', { defaultValue: 'Thuộc combo {{group}} — hủy leg này không hủy các leg còn lại.', group: b.comboGroup }) as string}
                </p>
              )}
              {missingSig(b) && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs leading-relaxed text-amber-700">
                  {t('bookings.missingSig', { defaultValue: 'Vé chưa có chữ ký số — liên hệ shop để cấp lại trước khi lên xe.' }) as string}
                </p>
              )}
              {verifyUrlOf(b) && (
                <p className="mt-2 text-xs">
                  <a
                    href={verifyUrlOf(b) as string}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-orange-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                  >
                    {t('verify.title', { defaultValue: 'Xác thực vé' }) as string} · {b.bookingCode}
                  </a>
                </p>
              )}
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
                      .catch((err) => toast.error(apiErrorMessage(err, t('bookings.invoiceFailed'))))
                      .finally(() => setInvoiceId(null));
                  }}
                >
                  {invoiceId === b.id ? null : <Download className="h-4 w-4" aria-hidden />}
                  {t('bookings.invoice')}
                </Button>
                {canModify(b) ? (
                  <Button variant="outline" onClick={() => openEdit(b)}>{t('bookings.modify')}</Button>
                ) : (
                  (b.bookingStatus === 'PENDING' || b.bookingStatus === 'CONFIRMED') && (
                    <span
                      title={
                        modifyLockedReason(b) === 'paid'
                          ? t('backendErrors.paidNoModify')
                          : modifyLockedReason(b) === 'processing'
                            ? t('backendErrors.paymentLocked')
                            : cancelLockedReason(b) === 'deadline'
                              ? t('backendErrors.freeCancelEnded')
                              : t('backendErrors.tourStartedNoCancel')
                      }
                      className="inline-flex min-h-11 cursor-not-allowed items-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-300"
                      aria-disabled="true"
                    >
                      {t('bookings.modify')}
                    </span>
                  )
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
                {b.bookingStatus === 'COMPLETED' && toUtcDay(b.travelDate) <= todayStart && !reviewedIds.has(b.id) && !myReviews[b.id] && (
                  <Button variant="outline" onClick={() => openReview(b.id)}>{t('bookings.writeReview')}</Button>
                )}
                {canCancel(b) ? (
                  <Button variant="danger" onClick={() => setConfirmId(b.id)}>{t('bookings.cancelRefund', { defaultValue: 'Hủy & hoàn tiền' }) as string}</Button>
                ) : (
                  (b.bookingStatus === 'PENDING' || b.bookingStatus === 'CONFIRMED') && (
                    <span
                      title={
                        cancelLockedReason(b) === 'deadline'
                          ? t('backendErrors.freeCancelEnded')
                          : t('backendErrors.tourStartedNoCancel')
                      }
                      className="inline-flex min-h-11 cursor-not-allowed items-center rounded-xl border border-red-100 px-4 py-2.5 text-sm font-medium text-red-200"
                      aria-disabled="true"
                    >
                      {t('bookings.cancel')}
                    </span>
                  )
                )}
                <Button variant="secondary" onClick={() => openSupport(b)}>
                  {t('bookings.support', { defaultValue: 'Hỗ trợ' }) as string}
                </Button>
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
                          <span key={`review-img-${i}`} className="relative shrink-0">
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
                    <Field label="Video (URL, tùy chọn)">
                      <Input value={reviewVideo} onChange={(e) => setReviewVideo(e.target.value)} placeholder="https://...mp4" inputMode="url" />
                    </Field>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => { setReviewFor(null); setEditingReview(null); setReviewImages([]); setReviewVideo(''); }}>{t('bookings.dialogCancel')}</Button>
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
        message={(() => {
          const b = bookings.find((x) => x.id === confirmId);
          const base = t('bookings.dialogMessage') as string;
          if (!b) return base;
          const refund = refundOf(b);
          const refundLine = t('bookings.refundAmount', {
            defaultValue: 'Số tiền hoàn: {{amount}}',
            amount: formatCurrency(refund),
          }) as string;
          return `${base}\n${refundLine}`;
        })()}
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
                <Input type="date" value={editDate} min={todayUtcInput()} onChange={(e) => setEditDate(e.target.value)} />
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
                    // Managed dates use the day's bucket instead (same-day keeps own seats).
                    return Math.max(
                      tour.minGuests,
                      Math.min(100, tour.maxGuests, editSeatCap),
                    );
                  })()}
                  disabled={editUnknown || editAvailLoading}
                  onChange={setEditCount}
                  decreaseLabel={t('tourDetails.decreaseGuests')}
                  increaseLabel={t('tourDetails.increaseGuests')}
                  labelledBy="edit-guests-label"
                />
                {editUnknown && (
                  <p role="status" className="mt-1.5 text-xs text-slate-400">…</p>
                )}
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
              <Button isLoading={submittingEdit} disabled={editUnknown || editAvailLoading} onClick={() => void submitEdit()}>{t('common.save')}</Button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={supportFor !== null} onClose={() => setSupportFor(null)} label={t('bookings.support', { defaultValue: 'Hỗ trợ' }) as string} wide>
        {supportFor && (
          <div>
            <h3 className="text-lg font-bold tracking-tight text-slate-900">
              {t('bookings.support', { defaultValue: 'Hỗ trợ' }) as string} · {supportFor.bookingCode}
            </h3>
            <p className="mt-1 truncate text-sm text-slate-500">{supportFor.tour?.title}</p>
            <div className="mt-4 max-h-80 space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3">
              {msgLoading ? (
                <p className="text-sm text-slate-500">…</p>
              ) : messages.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {t('bookings.supportEmpty', { defaultValue: 'Chưa có tin nhắn nào. Hãy hỏi shop nhé!' }) as string}
                </p>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className="rounded-lg bg-white p-3 shadow-sm">
                    <p className="text-xs font-semibold text-slate-900">
                      {m.sender?.name ?? m.senderRole}
                      <span className="ml-2 font-normal text-slate-400">{formatDateStr(m.createdAt)}</span>
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-700">{m.body}</p>
                  </div>
                ))
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <Input
                value={msgBody}
                onChange={(e) => setMsgBody(e.target.value)}
                placeholder={t('bookings.supportPlaceholder', { defaultValue: 'Nhập tin nhắn...' }) as string}
                aria-label={t('bookings.support', { defaultValue: 'Hỗ trợ' }) as string}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void sendMessage();
                }}
              />
              <Button isLoading={msgSending} onClick={() => void sendMessage()} className="shrink-0">
                {t('bookings.send', { defaultValue: 'Gửi' }) as string}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
}
