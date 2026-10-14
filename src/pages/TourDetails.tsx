import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Bus, Calendar, Check, ChevronRight, Clock, MapPin, ThumbsUp, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useEnumLabels } from '../i18n/enums';
import { useServiceLabel } from '../i18n/services';
import { formatCurrency, type PriceTier, type Review, type Tour, type TourQuestion } from '../types';
import { formatDateStr } from '../i18n/format';
import { resolveUnitPrice } from '../utils/pricing';
import { todayUtcInput, startOfTodayUtc } from '../utils/date';
import { destinationMapEmbed, destinationMapLink } from '../data/destinations';
import { pushRecent } from '../hooks/useRecentlyViewed';
import { TourCard } from '../components/tour/TourCard';
import { AvailabilityCalendar } from '../components/tour/AvailabilityCalendar';
import { FavoriteButton } from '../components/tour/TourCard';
import { Button, Card, EmptyState, Input, Modal, PageContainer, QuantityStepper, RetryState, SafeImage, SectionHeader, Skeleton, Stars, Textarea } from '../components/ui/kit';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

export function TourDetails() {
  const { t } = useTranslation();
  const labels = useEnumLabels();
  const serviceLabel = useServiceLabel();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tour, setTour] = useState<Tour | null>(null);
  const [related, setRelated] = useState<Tour[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [date, setDate] = useState('');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [activeImg, setActiveImg] = useState(0);
  const [helpful, setHelpful] = useState<Record<string, { voted: boolean; count: number }>>({});
  const [lightImg, setLightImg] = useState<string | null>(null);
  const bookCardRef = useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = useState(false);
  const [dateAvail, setDateAvail] = useState<{ managed: boolean; remaining: number | null } | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isPrivate, setIsPrivate] = useState(false);
  const [questions, setQuestions] = useState<TourQuestion[]>([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [qSubmitting, setQSubmitting] = useState(false);
  useDocumentMeta(tour?.title ?? '', tour?.description);

  useEffect(() => {
    if (!id) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError('');
    setLoadFailed(false);
    // New tour -> gallery starts over (a stale index could point past a shorter image list).
    setActiveImg(0);
    Promise.all([api.get(`/tours/${id}`, { signal: ctrl.signal }), api.get(`/reviews/tour/${id}`, { signal: ctrl.signal })])
      .then(([tourRes, r]) => {
        setTour(tourRes.data.tour);
        setRelated(tourRes.data.related ?? []);
        setReviews(r.data.data ?? []);
        // Recently viewed (local, no login needed).
        const loaded = tourRes.data.tour as Tour;
        if (loaded) {
          pushRecent({ id: loaded.id, title: loaded.title, image: loaded.images[0], price: loaded.price });
        }
      })
      .catch((err) => {
        if (axios.isAxiosError(err) && err.code === 'ERR_CANCELED') return;
        // Only a real 404 means "tour not found" — infra errors get a retry state instead.
        if (axios.isAxiosError(err) && err.response?.status === 404) setError(t('tourDetails.notFoundHint'));
        else setLoadFailed(true);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, t, loadAttempt]);

  // Mobile sticky booking bar: UI-only layer, appears once the booking card scrolls out of view.
  useEffect(() => {
    const el = bookCardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      ([entry]) => setShowBar(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [tour]);

  // Clamp the default party into the freshly loaded tour's valid range,
  // and re-clamp whenever the picked date's bucket changes the ceiling.
  // Adults >= 1 always; children fill the rest (backend requires 1+ adult too).
  useEffect(() => {
    if (!tour) return;
    const remaining =
      date !== '' && dateAvail?.managed === true && dateAvail?.remaining !== null && dateAvail?.remaining !== undefined
        ? dateAvail.remaining
        : tour.availableSeats;
    const hi = Math.max(tour.minGuests, Math.min(Math.min(tour.maxGuests, tour.availableSeats), remaining));
    setAdults((a) => Math.min(Math.max(a, 1), hi));
    setChildren((c) => Math.min(Math.max(c, 0), Math.max(0, hi - 1)));
  }, [tour, date, dateAvail]);

  // Helpful votes: counts are authoritative from the server, voted flags from
  // this device (backend toggle self-corrects cross-device drift).
  useEffect(() => {
    let stored: string[] = [];
    try {
      const raw = localStorage.getItem('tourbooking_helpful');
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) stored = parsed.filter((x): x is string => typeof x === 'string');
      }
    } catch {
      /* ignore */
    }
    setHelpful(Object.fromEntries(reviews.map((r) => [r.id, { voted: stored.includes(r.id), count: r.helpfulCount ?? 0 }])));
  }, [reviews]);

  const voteHelpful = async (reviewId: string) => {
    if (!user) {
      toast.error(t('tourDetails.loginToVote'));
      return;
    }
    try {
      const { data } = await api.post(`/reviews/${reviewId}/helpful`);
      setHelpful((prev) => ({ ...prev, [reviewId]: { voted: data.voted === true, count: data.helpfulCount ?? 0 } }));
      try {
        const raw = localStorage.getItem('tourbooking_helpful');
        const stored: string[] = raw ? (JSON.parse(raw) as string[]) : [];
        const next = data.voted === true ? [...new Set([...stored, reviewId])] : stored.filter((x) => x !== reviewId);
        localStorage.setItem('tourbooking_helpful', JSON.stringify(next));
      } catch {
        /* ignore */
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, t('tourDetails.voteFailed')));
    }
  };

  // Per-date availability for the picked day (managed dates only; open dates
  // fall back to the tour's global seats). A failed check assumes an open date
  // so booking never dead-locks — the backend enforces the real bucket.
  useEffect(() => {
    if (!tour || !date) {
      setDateAvail(null);
      return;
    }
    const ctrl = new AbortController();
    setDateAvail(null);
    api
      .get(`/tours/${tour.id}/availability`, { params: { date }, signal: ctrl.signal })
      .then((r) => setDateAvail({ managed: r.data.managed, remaining: r.data.remaining }))
      .catch(() => {
        if (!ctrl.signal.aborted) setDateAvail({ managed: false, remaining: null });
      });
    return () => ctrl.abort();
  }, [tour, date]);

  // Hỏi & đáp của tour (public list, cần login để hỏi).
  useEffect(() => {
    if (!id) return;
    setIsPrivate(false);
    const ctrl = new AbortController();
    api
      .get(`/tours/${id}/questions`, { signal: ctrl.signal })
      .then((r) => setQuestions((r.data.data ?? []).filter((q: TourQuestion) => !q.hidden)))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [id]);

  const submitQuestion = async () => {
    if (!user) {
      toast.error(t('tourDetails.loginToAsk', { defaultValue: 'Đăng nhập để đặt câu hỏi' }) as string);
      return;
    }
    const q = newQuestion.trim();
    if (!q || !id) return;
    setQSubmitting(true);
    try {
      const { data } = await api.post(`/tours/${id}/questions`, { question: q });
      if (data.question) setQuestions((prev) => [data.question, ...prev]);
      else {
        const r = await api.get(`/tours/${id}/questions`);
        setQuestions((r.data.data ?? []).filter((q: TourQuestion) => !q.hidden));
      }
      setNewQuestion('');
      toast.success(t('tourDetails.questionSent', { defaultValue: 'Đã gửi câu hỏi' }) as string);
    } catch (err) {
      toast.error(apiErrorMessage(err, t('tourDetails.questionFailed', { defaultValue: 'Gửi câu hỏi thất bại' }) as string));
    } finally {
      setQSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PageContainer className="py-8 md:py-10">
        <Skeleton className="h-72 md:h-105" />
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </PageContainer>
    );
  }
  if (loadFailed) {
    return (
      <PageContainer className="py-8 md:py-10">
        <RetryState title={t('tours.loadError')} onRetry={() => setLoadAttempt((a) => a + 1)} retryLabel={t('tours.retry')} />
      </PageContainer>
    );
  }
  if (error || !tour) {
    return (
      <PageContainer className="py-8 md:py-10">
        <EmptyState title={t('tourDetails.notFound')} hint={error} action={<Link to="/tours"><Button>{t('tourDetails.backToTours')}</Button></Link>} />
      </PageContainer>
    );
  }

  const maxGuests = Math.min(tour.maxGuests, tour.availableSeats);
  const soldOut = tour.availableSeats <= 0;
  // Seats shown once a date is picked: managed dates report their own bucket,
  // open dates fall back to the global counter. While the bucket is loading
  // (dateAvail === null) seats are UNKNOWN — never show global as fact.
  const seatsUnknown = date !== '' && dateAvail === null;
  const dateManaged = date !== '' && dateAvail?.managed === true;
  const shownSeats = seatsUnknown
    ? tour.availableSeats
    : dateManaged && dateAvail?.remaining !== null && dateAvail?.remaining !== undefined
      ? dateAvail.remaining
      : tour.availableSeats;
  const dateSoldOut = !seatsUnknown && dateManaged && shownSeats <= 0;
  const dateIsPast = date !== '' && !Number.isNaN(Date.parse(date)) && Date.parse(date) < startOfTodayUtc();
  const bookDisabled = soldOut || dateSoldOut || seatsUnknown || dateIsPast || date === '';
  // The party size is capped by the picked date's bucket too — not just the
  // global counter — so "5 guests on a date with 2 seats left" fails here,
  // not after checkout.
  const effectiveMax = Math.max(tour.minGuests, Math.min(maxGuests, shownSeats));
  // Hint shows the effective bookable max (seats-limited), never below the minimum.
  const hintMax = date === '' ? Math.max(tour.minGuests, maxGuests) : effectiveMax;
  const party = adults + children;
  const tourExt = tour as Tour & { priceTiers?: PriceTier[] | null; privateAvailable?: boolean | null; privateSurcharge?: number | null };
  const priceTiers = Array.isArray(tourExt.priceTiers) ? tourExt.priceTiers : [];
  const privateAvailable = tourExt.privateAvailable === true;
  const privateSurcharge = tourExt.privateSurcharge ?? 0;
  const privateEffective = privateAvailable && isPrivate;
  const tierUnits = resolveUnitPrice(tour, party);
  const hasChildPrice = tierUnits.childPrice != null && tierUnits.childPrice > 0;
  const partySubtotal = adults * tierUnits.price + (hasChildPrice ? children * (tierUnits.childPrice as number) : 0);
  const setAdultsClamped = (n: number) => {
    const na = Math.min(Math.max(n, 1), effectiveMax);
    setAdults(na);
    setChildren((c) => Math.min(c, Math.max(0, effectiveMax - na)));
  };
  const setChildrenClamped = (n: number) => {
    setChildren(Math.min(Math.max(n, 0), Math.max(0, effectiveMax - adults)));
  };
  const bookNow = () => {
    if (user?.role === 'ADMIN') {
      toast.error(t('backendErrors.adminNoBooking', { defaultValue: 'Tài khoản quản trị không thể đặt tour, hãy dùng tài khoản khách hàng' }) as string);
      navigate('/admin/bookings');
      return;
    }
    if (user && (user.emailVerified ?? false) === false) {
      toast.error(t('auth.verifyRequired', { defaultValue: 'Bạn cần xác thực email trước khi đặt tour.' }) as string);
      navigate('/verify-email');
      return;
    }
    if (!date || dateIsPast) {
      toast.error(t('tourDetails.chooseDate'));
      return;
    }
    if (seatsUnknown) {
      toast.error(t('tours.loadError'));
      return;
    }
    if (party < tour.minGuests || party > effectiveMax) {
      toast.error(t('tourDetails.guestsRange', { min: tour.minGuests, max: effectiveMax }));
      return;
    }
    navigate(`/checkout?tourId=${tour.id}&date=${date}&adults=${adults}&children=${children}${privateEffective ? '&private=1' : ''}`);
  };
  // Free-cancellation deadline for the picked date (policy text only; the
  // backend enforces it on paid bookings).
  const cancelDeadline =
    tour.freeCancelHours != null && date !== '' && !Number.isNaN(new Date(date).getTime())
      ? new Date(new Date(date).getTime() - tour.freeCancelHours * 3600_000).toISOString()
      : null;
  const cancelBadgeText =
    tour.freeCancelHours == null
      ? (t('tourDetails.freeCancelFlexible', { defaultValue: 'Hủy miễn phí linh hoạt' }) as string)
      : (t('tourDetails.freeCancelHoursShort', { defaultValue: 'Hủy miễn phí trước {{hours}} giờ khởi hành', hours: tour.freeCancelHours }) as string);
  const mapEmbed = destinationMapEmbed(tour.destination);
  const mapLink = destinationMapLink(tour.destination);

  const infoTiles = [
    { icon: MapPin, label: t('tourDetails.departure'), value: tour.departureLocation },
    { icon: MapPin, label: t('tourDetails.destination'), value: tour.destination },
    { icon: Clock, label: t('tourDetails.duration'), value: tour.duration },
    ...(tour.departureHour != null
      ? [{ icon: Clock, label: 'Giờ KH', value: `${String(tour.departureHour).padStart(2, '0')}:00` }]
      : []),
    { icon: Bus, label: t('tourDetails.transportation'), value: tour.transportation.map((m) => labels.transportation(m)).join(' + ') },
  ];

  return (
    <PageContainer size="wide" className={`py-6 md:py-10 ${showBar ? 'pb-28 lg:pb-10' : ''}`}>
      <nav aria-label="breadcrumb" className="flex min-w-0 items-center gap-1 text-sm text-slate-500">
        <Link to="/" className="shrink-0 rounded transition-colors hover:text-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700">{t('nav.home')}</Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
        <Link to="/tours" className="shrink-0 rounded transition-colors hover:text-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700">{t('nav.tours')}</Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
        <span aria-current="page" className="truncate font-medium text-slate-900">{tour.title}</span>
      </nav>

      {/* Title block */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-3xl">
          <span className="inline-flex rounded-full bg-orange-700 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
            {labels.category(tour.category)}
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">{tour.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <Stars value={tour.rating} />
              <span className="font-semibold tabular-nums text-slate-900">{tour.rating.toFixed(1)}</span>
              <span className="tabular-nums text-slate-400">({tour.reviewCount})</span>
            </span>
            <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-orange-700" aria-hidden /> {tour.destination}</span>
            <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4 text-slate-400" aria-hidden /> {tour.duration}</span>
            <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-slate-400" aria-hidden /> {t('bookings.guestsSuffix', { count: tour.maxGuests })}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-8 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          {/* Gallery */}
          <div className="overflow-hidden rounded-3xl border border-slate-200/70 bg-slate-100 shadow-soft">
            <SafeImage src={tour.images[activeImg]} alt={tour.title} eager className="h-72 w-full object-cover sm:h-96 lg:h-120" />
          </div>
          {tour.images.length > 1 && (
            <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto pb-1" role="group" aria-label={tour.title}>
              {tour.images.map((img, i) => (
                <button
                  key={`${img}-${i}`}
                  aria-label={`${tour.title} — ${i + 1}/${tour.images.length}`}
                  aria-pressed={i === activeImg}
                  onClick={() => setActiveImg(i)}
                  className={`h-20 w-28 shrink-0 overflow-hidden rounded-2xl border-[3px] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 ${
                    i === activeImg ? 'border-orange-700 shadow-sm' : 'border-transparent opacity-60 hover:opacity-100 active:scale-95'
                  }`}
                >
                  <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}

          <p className="mt-6 text-[17px] leading-relaxed text-slate-600">{tour.description}</p>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {infoTiles.map((tile) => (
              <div key={tile.label} className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-soft">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
                  <tile.icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">{tile.label}</span>
                  <span className="mt-0.5 block truncate font-semibold text-slate-900" title={tile.value}>{tile.value}</span>
                </span>
              </div>
            ))}
          </div>

          <Card className="mt-6 p-5 sm:p-7">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-700">{t('itinerary.title')}</p>
            {!Array.isArray(tour.itinerary) || tour.itinerary.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">{t('itinerary.emptyTitle')}</p>
            ) : (
              <ol className="mt-5">
                {[...tour.itinerary].sort((a, b) => a.day - b.day).map((d, i, arr) => (
                  <li key={d.day} className="relative flex gap-4 pb-7 last:pb-0">
                    {i < arr.length - 1 && (
                      <span aria-hidden className="absolute left-5 top-12 h-[calc(100%-2.75rem)] w-0.5 rounded bg-orange-100" />
                    )}
                    <span className="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-700 text-sm font-bold tabular-nums text-white shadow-sm">
                      {d.day}
                    </span>
                    <div className="min-w-0 flex-1 pb-1">
                      <p className="text-xs font-bold uppercase tracking-wider text-orange-700">
                        {t('itinerary.day', { day: d.day })}
                      </p>
                      <p className="mt-1 text-[17px] font-bold tracking-tight text-slate-900">{d.title}</p>
                      <ul className="mt-2.5 space-y-2">
                        {d.activities.map((a, idx) => (
                          <li key={`${d.day}-${idx}`} className="flex items-start gap-2.5 text-[15px] text-slate-600">
                            <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-orange-700" aria-hidden />
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="border-emerald-100 bg-emerald-50/40 p-5 sm:p-6">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
                  <Check className="h-4 w-4" aria-hidden />
                </span>
                {t('tourDetails.included')}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {tour.includedServices.map((s) => (
                  <li key={s} className="flex items-start gap-2 text-sm text-slate-600">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                    <span>{serviceLabel(s)}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="border-red-100 bg-red-50/40 p-5 sm:p-6">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500 text-white">
                  <X className="h-4 w-4" aria-hidden />
                </span>
                {t('tourDetails.excluded')}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {tour.excludedServices.map((s) => (
                  <li key={s} className="flex items-start gap-2 text-sm text-slate-600">
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden />
                    <span>{serviceLabel(s)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card className="mt-6 p-5 sm:p-7">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">{t('tourDetails.reviews', { count: tour.reviewCount })}</h2>
            {reviews.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">{t('tourDetails.noReviews')}</p>
            ) : (
              <div className="mt-5 space-y-5">
                {reviews.map((r) => {
                  const vote = helpful[r.id] ?? { voted: false, count: r.helpfulCount ?? 0 };
                  const images = Array.isArray(r.images) ? r.images : [];
                  const videos = Array.isArray(r.videos) ? r.videos : [];
                  return (
                    <div key={r.id} className="border-b border-slate-100 pb-5 last:border-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2.5">
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-700 text-sm font-bold text-white" aria-hidden>
                            {(r.user?.name ?? '?').charAt(0).toUpperCase()}
                          </span>
                          <span>
                            <span className="font-semibold text-slate-900">{r.user?.name ?? t('tourDetails.travelerDefault')}</span>
                            {(r.verifiedTrip === true) && (
                              <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                                ✓ {t('tourDetails.verifiedTrip', { defaultValue: 'Đã đi tour' }) as string}
                              </span>
                            )}
                          </span>
                        </span>
                        <Stars value={r.rating} />
                      </div>
                      {r.comment && <p className="mt-2.5 text-[15px] leading-relaxed text-slate-600">{r.comment}</p>}
                      {images.length > 0 && (
                        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                          {images.map((src, i) => (
                            <button
                              key={`${r.id}-img-${i}`}
                              type="button"
                              onClick={() => setLightImg(src)}
                              aria-label={`${r.user?.name ?? ''} — ${i + 1}/${images.length}`}
                              className="h-20 w-28 shrink-0 overflow-hidden rounded-xl border border-slate-200 transition-all hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 active:scale-95"
                            >
                              <SafeImage src={src} alt="" className="h-full w-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                      {videos.length > 0 && (
                        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                          {videos.map((src, i) => (
                            <video key={`${r.id}-vid-${i}`} src={src} controls preload="metadata" className="h-28 w-44 shrink-0 rounded-xl border border-slate-200 bg-black" />
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => void voteHelpful(r.id)}
                        aria-pressed={vote.voted}
                        className={`mt-2.5 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 active:scale-95 ${
                          vote.voted ? 'bg-orange-700 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <ThumbsUp className={`h-3.5 w-3.5 ${vote.voted ? 'fill-current' : ''}`} aria-hidden />
                        {t('tourDetails.helpful', { defaultValue: 'Hữu ích' }) as string}
                        <span className="tabular-nums">({vote.count})</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="mt-6 p-5 sm:p-7">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              {t('tourDetails.qaTitle', { defaultValue: 'Hỏi & Đáp' }) as string}
            </h2>
            {questions.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                {t('tourDetails.qaEmpty', { defaultValue: 'Chưa có câu hỏi nào. Hãy là người đầu tiên hỏi!' }) as string}
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {questions.map((q) => (
                  <div key={q.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                    <p className="text-sm font-semibold text-slate-900">
                      {q.user?.name ?? t('tourDetails.travelerDefault')}
                      <span className="ml-2 text-xs font-normal text-slate-400">{formatDateStr(q.createdAt)}</span>
                    </p>
                    <p className="mt-1.5 text-[15px] text-slate-700">{q.question}</p>
                    {q.answer ? (
                      <div className="mt-2.5 rounded-lg bg-emerald-50 p-3 text-sm leading-relaxed text-emerald-900">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                          {t('tourDetails.qaAnswer', { defaultValue: 'Shop trả lời' }) as string}
                          {q.answeredAt && <span className="ml-2 font-normal normal-case">· {formatDateStr(q.answeredAt)}</span>}
                        </p>
                        <p className="mt-1">{q.answer}</p>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs italic text-slate-400">
                        {t('tourDetails.qaWaiting', { defaultValue: 'Đang chờ shop trả lời...' }) as string}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4">
              <Textarea
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder={t('tourDetails.qaPlaceholder', { defaultValue: 'Đặt câu hỏi về tour này...' }) as string}
                aria-label={t('tourDetails.qaTitle', { defaultValue: 'Hỏi & Đáp' }) as string}
              />
              <Button className="mt-2" isLoading={qSubmitting} onClick={() => void submitQuestion()}>
                {t('tourDetails.qaSubmit', { defaultValue: 'Gửi câu hỏi' }) as string}
              </Button>
            </div>
          </Card>

          {mapEmbed && (
            <Card className="mt-6 overflow-hidden p-0">
              <div className="flex items-center justify-between gap-2 p-5 pb-3 sm:px-7">
                <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900">
                  <MapPin className="h-5 w-5 text-orange-700" aria-hidden />
                  {tour.destination}
                </h2>
                {mapLink && (
                  <a
                    href={mapLink}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-lg text-sm font-semibold text-orange-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                  >
                    {t('tourDetails.openMap', { defaultValue: 'Mở bản đồ lớn' }) as string}
                  </a>
                )}
              </div>
              <iframe
                title={`${tour.destination} map`}
                src={mapEmbed}
                loading="lazy"
                className="h-64 w-full border-0 sm:h-72"
              />
            </Card>
          )}
          <Modal open={lightImg !== null} onClose={() => setLightImg(null)} label={t('tourDetails.reviews', { count: tour.reviewCount })}>
            {lightImg && <img src={lightImg} alt="" className="max-h-[70dvh] w-full rounded-xl object-contain" />}
          </Modal>
        </div>

        <aside className="lg:col-span-1">
          <div ref={bookCardRef}>
            <Card className="overflow-hidden p-0 lg:sticky lg:top-24">
              <div className="bg-slate-900 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t('tourDetails.from')}</p>
                    <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-white">{formatCurrency(tour.price)}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{t('tourDetails.perGuest')}</p>
                    <p className="mt-2 inline-flex rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-bold text-emerald-200">
                      {cancelBadgeText}
                    </p>
                    {hasChildPrice && (
                      <p className="mt-1.5 text-xs tabular-nums text-slate-300">
                        {t('tourDetails.childPrice', { defaultValue: 'Trẻ em' }) as string}: {formatCurrency(tour.childPrice as number)}
                        {tour.childMaxAge != null && (
                          <span> · {t('tourDetails.childMaxAge', { defaultValue: 'dưới {{age}} tuổi', age: tour.childMaxAge }) as string}</span>
                        )}
                      </p>
                    )}
                  </div>
                  <span><FavoriteButton tourId={tour.id} /></span>
                </div>
                {/* Seats are only meaningful alongside a travel date — don't claim
                    availability before one is picked. */}
                {date !== '' && (
                  <p className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-bold ${seatsUnknown ? 'bg-slate-500/20 text-slate-200' : shownSeats <= 0 ? 'bg-red-500/20 text-red-200' : shownSeats <= 5 ? 'bg-amber-400/20 text-amber-200' : 'bg-emerald-400/20 text-emerald-200'}`}>
                    {seatsUnknown ? '…' : t('tourDetails.seatsAvailable', { count: shownSeats })}
                  </p>
                )}
              </div>
              <div className="space-y-4 p-5 sm:p-6">
                <div>
                  <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700"><Calendar className="h-4 w-4 text-slate-400" aria-hidden /> {t('tourDetails.travelDate')}</span>
                  <AvailabilityCalendar tourId={tour.id} value={date} onChange={setDate} />
                  {/* Manual entry fallback (kept for keyboard users): hidden visually but functional. */}
                  <Input
                    type="date"
                    value={date}
                    min={todayUtcInput()}
                    onChange={(e) => setDate(e.target.value)}
                    aria-label={t('tourDetails.travelDate')}
                    className="mt-2"
                  />
                </div>
                <div>
                  <span id="guests-label" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700"><Users className="h-4 w-4 text-slate-400" aria-hidden /> {t('tourDetails.guests')}</span>
                  <div className="space-y-3">
                    <div>
                      <span id="adults-label" className="mb-1 block text-xs font-medium text-slate-500">
                        {t('tourDetails.adults', { defaultValue: 'Người lớn' }) as string}
                      </span>
                      <QuantityStepper
                        value={adults}
                        min={1}
                        max={effectiveMax}
                        disabled={soldOut || dateSoldOut || seatsUnknown}
                        onChange={setAdultsClamped}
                        decreaseLabel={t('tourDetails.decreaseGuests')}
                        increaseLabel={t('tourDetails.increaseGuests')}
                        labelledBy="adults-label"
                      />
                    </div>
                    {hasChildPrice && (
                      <div>
                        <span id="children-label" className="mb-1 block text-xs font-medium text-slate-500">
                          {t('tourDetails.children', { defaultValue: 'Trẻ em' }) as string} · {formatCurrency(tour.childPrice as number)}
                        </span>
                        <QuantityStepper
                          value={children}
                          min={0}
                          max={Math.max(0, effectiveMax - adults)}
                          disabled={soldOut || dateSoldOut || seatsUnknown}
                          onChange={setChildrenClamped}
                          decreaseLabel={t('tourDetails.decreaseGuests')}
                          increaseLabel={t('tourDetails.increaseGuests')}
                          labelledBy="children-label"
                        />
                      </div>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">
                    {soldOut || dateSoldOut
                      ? t('tourDetails.soldOut')
                      : t('tourDetails.guestsMinMax', { min: tour.minGuests, max: hintMax })}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">{t('tourDetails.subtotal', { count: party })}</span>
                    <span className="text-lg font-bold tabular-nums text-slate-900">{formatCurrency(partySubtotal)}</span>
                  </div>
                  {children > 0 && hasChildPrice && (
                    <p className="mt-1 text-right text-xs tabular-nums text-slate-400">
                      {adults} × {formatCurrency(tour.price)} + {children} × {formatCurrency(tour.childPrice as number)}
                    </p>
                  )}
                  {privateEffective && privateSurcharge > 0 && (
                    <p className="mt-1 flex justify-between text-xs tabular-nums text-slate-500">
                      <span>{t('tourDetails.privateSurcharge', { defaultValue: 'Phụ thu đi riêng' }) as string}</span>
                      <span>+{formatCurrency(privateSurcharge)}</span>
                    </p>
                  )}
                </div>
                {priceTiers.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 p-4 text-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      {t('tourDetails.groupPrice', { defaultValue: 'Giá theo đoàn' }) as string}
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {priceTiers.map((tier, i) => (
                        <li key={i} className="flex justify-between gap-2 text-sm text-slate-600">
                          <span>{t('tourDetails.groupTier', { defaultValue: 'Từ {{count}} khách', count: tier.minGuests }) as string}</span>
                          <span className="font-semibold tabular-nums text-slate-900">
                            {formatCurrency(tier.price)}{t('tourDetails.perGuestShort', { defaultValue: '/khách' }) as string}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {privateAvailable && (
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 p-3.5 text-sm transition-colors hover:border-orange-300">
                    <input
                      type="checkbox"
                      checked={isPrivate}
                      onChange={(e) => setIsPrivate(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-orange-700"
                    />
                    <span>
                      <span className="font-semibold text-slate-900">
                        {t('tourDetails.privateTour', { defaultValue: 'Đi riêng đoàn' }) as string}
                        {privateSurcharge > 0 && (
                          <span className="tabular-nums"> (+{formatCurrency(privateSurcharge)})</span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {t('tourDetails.privateHint', { defaultValue: 'Riêng đoàn, không ghép khách khác' }) as string}
                      </span>
                    </span>
                  </label>
                )}
                {tour.freeCancelHours != null && (
                  <p className="rounded-xl bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-700">
                    {cancelDeadline
                      ? (t('tourDetails.freeCancelUntil', { defaultValue: 'Hủy miễn phí đến {{date}}', date: formatDateStr(cancelDeadline) }) as string)
                      : (t('tourDetails.freeCancelHours', { defaultValue: 'Hủy miễn phí trước {{hours}} giờ khởi hành', hours: tour.freeCancelHours }) as string)}
                  </p>
                )}
                <Button variant={bookDisabled ? 'danger' : 'primary'} className="w-full py-3.5 text-base" disabled={bookDisabled} onClick={bookNow}>
                  {bookDisabled ? t('tourDetails.soldOut') : t('tourDetails.bookNow')}
                </Button>
                <p className="text-center text-xs text-slate-400">{t('tourDetails.noCharge')}</p>
              </div>
            </Card>
          </div>
        </aside>
      </div>

      {related.length > 0 && (
        <div className="mt-12 md:mt-16">
          <SectionHeader title={t('tourDetails.related')} />
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((rel) => <TourCard key={rel.id} tour={rel} />)}
          </div>
        </div>
      )}

      {/* Mobile sticky booking bar (UI-only, IntersectionObserver-driven) */}
      {showBar && !bookDisabled && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t('tourDetails.from')}</p>
              <p className="truncate text-xl font-bold tabular-nums tracking-tight text-orange-700">{formatCurrency(tour.price)}</p>
            </div>
            <Button className="shrink-0 px-8 py-3" onClick={bookNow}>
              {t('tourDetails.bookNow')}
            </Button>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
