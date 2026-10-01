import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { BadgeCheck, Landmark, CreditCard, Banknote, ShieldCheck, TicketPercent } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useEnumLabels } from '../i18n/enums';
import { formatDateStr } from '../i18n/format';
import { formatCurrency, type Tour } from '../types';
import { Button, Card, EmptyState, Field, Input, PageContainer, QuantityStepper, Skeleton, Steps, Textarea } from '../components/ui/kit';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { startOfTodayUtc, todayLocalInput } from '../utils/date';

export function Checkout() {
  const { t } = useTranslation();
  useDocumentMeta(t('checkout.title'));
  const labels = useEnumLabels();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tourId = params.get('tourId') ?? '';
  const date = params.get('date') ?? '';
  // A malformed ?date= must behave like a missing one (empty state), never "Invalid Date".
  const dateValid = date !== '' && !Number.isNaN(Date.parse(date));
  // Party from ?adults=&children= (TourDetails), falling back to legacy ?guests=.
  const rawAdults = Number(params.get('adults') ?? NaN);
  const rawChildren = Number(params.get('children') ?? NaN);
  const rawGuests = Number(params.get('guests') ?? NaN);
  const initialAdults = Number.isFinite(rawAdults)
    ? Math.max(1, Math.min(100, Math.floor(rawAdults)))
    : Math.max(1, Math.min(100, Math.floor(rawGuests) || 1));
  const initialChildren = Number.isFinite(rawChildren) ? Math.max(0, Math.min(100, Math.floor(rawChildren))) : 0;

  const schema = useMemo(() => {
    const guestSchema = z.object({
      fullName: z.string().min(2, t('validation.guestNameRequired')),
      // Matches backend guestSchema (max 20) so overlong input fails here, not as a generic 400.
      phone: z.string().max(20).optional(),
      email: z.string().email(t('validation.emailInvalid')).optional().or(z.literal('')),
      // Row type is derived from the counts (first `adults` rows are adults),
      // so the form always carries an explicit flag (backend defaults too).
      isChild: z.boolean(),
      // Child rows must carry a date of birth: the backend verifies the age
      // against the tour's childMaxAge (no self-declared child fares).
      dob: z.string().optional(),
    });
    return z.object({
      customerName: z.string().min(2, t('validation.fullNameRequired')).max(100),
      customerEmail: z.string().email(t('validation.emailInvalid')),
      customerPhone: z.string().regex(/^[0-9+\s-]{8,20}$/, t('validation.phoneInvalid')),
      note: z.string().max(1000).optional(),
      paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CARD']),
      guestsList: z.array(guestSchema).min(1),
    });
  }, [t]);

  type FormValues = z.infer<typeof schema>;

  const [tour, setTour] = useState<Tour | null>(null);
  const [loading, setLoading] = useState(true);
  const [coupon, setCoupon] = useState('');
  const [discount, setDiscount] = useState(0);
  const [couponMsg, setCouponMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Per-date seats for the picked day (mirrors TourDetails): managed dates use
  // their own bucket, open dates fall back to the global counter. Unknown
  // (still loading/failed) falls back to global so the form never dead-locks.
  const [dateAvail, setDateAvail] = useState<{ managed: boolean; remaining: number | null } | null>(null);
  const dateManaged = dateValid && dateAvail?.managed === true;
  const dateRemaining = dateManaged && dateAvail?.remaining != null ? dateAvail.remaining : null;

  const { register, control, handleSubmit, watch, reset, getValues, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      paymentMethod: 'BANK_TRANSFER',
      guestsList: Array.from({ length: initialAdults + initialChildren }, (_, i) => ({
        fullName: '',
        phone: '',
        email: '',
        isChild: i >= initialAdults,
        dob: '',
      })),
    },
  });
  const { fields } = useFieldArray({ control, name: 'guestsList' });
  const paymentMethod = watch('paymentMethod');
  // Party size lives here (URL is only the initial value): travelers type is
  // derived by index (first `adults` rows are adults, the rest children).
  const [adults, setAdults] = useState(initialAdults);
  const [children, setChildren] = useState(initialChildren);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const partyCount = adults + children;

  const toggleAddon = (id: string) =>
    setAddonIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Keep the travelers form in sync with the counts: pad with blank rows or
  // trim extras (preserving already-typed names where possible). Row types
  // follow the counts, so flags are re-derived by index every sync.
  const guestsListLength = fields.length;
  useEffect(() => {
    if (guestsListLength === partyCount) {
      // Counts match but types may have shifted (e.g. adults shrank): fix flags.
      const current = getValues('guestsList');
      if (current.some((r, i) => (r.isChild === true) !== i >= adults)) {
        reset(
          { ...getValues(), guestsList: current.map((r, i) => ({ ...r, isChild: i >= adults })) },
          { keepErrors: true },
        );
      }
      return;
    }
    const current = getValues('guestsList');
    const blank = { fullName: '', phone: '', email: '', isChild: false, dob: '' };
    const resized =
      current.length < partyCount
        ? [...current, ...Array.from({ length: partyCount - current.length }, () => ({ ...blank }))]
        : current.slice(0, partyCount);
    reset(
      { ...getValues(), guestsList: resized.map((r, i) => ({ ...r, isChild: i >= adults })) },
      { keepErrors: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyCount, guestsListLength]);

  useEffect(() => {
    if (!tourId) {
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    api
      .get(`/tours/${tourId}`, { signal: ctrl.signal })
      .then((res) => setTour(res.data.tour))
      .catch((err) => {
        if (axios.isAxiosError(err) && err.code === 'ERR_CANCELED') return;
        setTour(null);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [tourId]);

  // Seats left depend on the picked day: fetch the day's bucket (if managed).
  useEffect(() => {
    if (!tour || !dateValid) {
      setDateAvail(null);
      return;
    }
    const ctrl = new AbortController();
    api
      .get(`/tours/${tour.id}/availability`, { params: { date }, signal: ctrl.signal })
      .then((r) => setDateAvail({ managed: r.data.managed, remaining: r.data.remaining }))
      .catch(() => {
        if (!ctrl.signal.aborted) setDateAvail(null);
      });
    return () => ctrl.abort();
  }, [tour, dateValid, date]);

  // Clamp the party into the freshly loaded tour's range (and drop children
  // when the tour sells no child tickets). On managed dates the day's bucket
  // caps the party — not just the global counter — so an oversized party fails
  // here with an explanation, not as a generic 400 after filling the form.
  useEffect(() => {
    if (!tour) return;
    const cap = dateRemaining ?? Math.max(0, tour.availableSeats);
    const hi = Math.max(tour.minGuests, Math.min(tour.maxGuests, cap));
    const childOk = tour.childPrice != null && tour.childPrice > 0;
    setAdults((a) => Math.min(Math.max(a, 1), hi));
    setChildren((c) => Math.min(Math.max(childOk ? c : 0, 0), Math.max(0, hi - 1)));
  }, [tour, dateAvail]);

  const hasChildPrice = tour != null && tour.childPrice != null && tour.childPrice > 0;
  const childPrice = tour?.childPrice ?? 0;
  const adultTotal = (tour?.price ?? 0) * adults;
  const childTotal = hasChildPrice ? childPrice * children : 0;
  const subtotal = adultTotal + childTotal;
  const tourAddons = useMemo(() => (Array.isArray(tour?.addons) ? tour!.addons : []), [tour]);
  const addonsTotal = useMemo(
    () =>
      tourAddons
        .filter((a) => addonIds.includes(a.id))
        .reduce((sum, a) => sum + (a.perPerson ? a.price * partyCount : a.price), 0),
    [tourAddons, addonIds, partyCount],
  );
  // The displayed discount belongs to the subtotal it was validated against.
  // If the party size (hence subtotal) changes afterwards, drop it so the
  // summary can never promise a total the backend won't charge. Add-ons don't
  // affect the coupon (it applies to the fare only, like the backend).
  const [appliedSubtotal, setAppliedSubtotal] = useState<number | null>(null);
  useEffect(() => {
    if (appliedSubtotal !== null && subtotal !== appliedSubtotal) {
      setAppliedSubtotal(null);
      setDiscount(0);
      setCouponMsg('');
    }
  }, [subtotal, appliedSubtotal]);
  const total = Math.max(0, subtotal - discount + addonsTotal);

  const paymentLabel = (m: 'BANK_TRANSFER' | 'CARD' | 'CASH'): string => labels.paymentMethod(m);
  const paymentIcon = (m: 'BANK_TRANSFER' | 'CARD' | 'CASH') =>
    m === 'BANK_TRANSFER' ? Landmark : m === 'CARD' ? CreditCard : Banknote;

  const applyCoupon = async () => {
    if (!coupon.trim()) return;
    try {
      const { data } = await api.post('/coupons/validate', { code: coupon.trim(), subtotal });
      setDiscount(data.discount);
      setAppliedSubtotal(subtotal);
      setCouponMsg(t('checkout.couponApplied', { discount: formatCurrency(data.discount) }));
      toast.success(t('checkout.couponApplied', { discount: formatCurrency(data.discount) }));
    } catch (err) {
      setDiscount(0);
      setAppliedSubtotal(null);
      setCouponMsg(apiErrorMessage(err, t('checkout.bookingFailed')));
    }
  };

  const onSubmit = async (values: FormValues) => {
    // Belt-and-braces behind the RequireCustomer route guard (mirrors TourDetails.bookNow).
    if (user?.role === 'ADMIN') {
      toast.error(t('backendErrors.adminNoBooking', { defaultValue: 'Tài khoản quản trị không thể đặt tour, hãy dùng tài khoản khách hàng' }) as string);
      navigate('/admin');
      return;
    }
    if (!tour || !dateValid || Date.parse(date) < startOfTodayUtc()) {
      toast.error(t('checkout.missingInfo'));
      return;
    }
    if (children > 0 && !hasChildPrice) {
      toast.error(t('checkout.bookingFailed'));
      return;
    }
    if (values.guestsList.some((g) => g.isChild && (!g.dob || Number.isNaN(Date.parse(g.dob))))) {
      toast.error(t('validation.childDobRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post('/bookings', {
        tourId: tour.id,
        travelDate: new Date(date).toISOString(),
        customerName: values.customerName,
        customerEmail: values.customerEmail,
        customerPhone: values.customerPhone,
        note: values.note || undefined,
        couponCode: coupon.trim() || undefined,
        paymentMethod: values.paymentMethod,
        addons: addonIds,
        guestsList: values.guestsList.map((g) => ({
          fullName: g.fullName,
          isChild: g.isChild,
          dateOfBirth: g.dob || undefined,
          phone: g.phone || undefined,
          email: g.email || undefined,
        })),
      });
      navigate(`/booking-success/${data.booking.bookingCode}`, { state: { fresh: true } });
    } catch (err) {
      toast.error(apiErrorMessage(err, t('checkout.bookingFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PageContainer className="max-w-5xl py-10"><Skeleton className="h-96" /></PageContainer>
    );
  }
  if (!tourId || !dateValid || !tour) {
    return (
      <PageContainer className="max-w-5xl py-10">
        <EmptyState
          title={t('checkout.missingTitle')}
          hint={t('checkout.missingHint')}
          action={<Link to="/tours"><Button>{t('checkout.browseTours')}</Button></Link>}
        />
      </PageContainer>
    );
  }

  // Validate the party against the freshly loaded tour before rendering the form:
  // wrong size or a sold-out/past date fails here with an explanation, not as a
  // generic 400 after the customer filled everything in.
  const dateOk = dateValid && Date.parse(date) >= startOfTodayUtc();
  // Day-aware seat ceiling: the managed day's bucket when known, else global.
  const seatCap = dateRemaining ?? Math.max(0, tour.availableSeats);
  const guestsOk =
    partyCount >= tour.minGuests &&
    partyCount <= tour.maxGuests &&
    partyCount <= seatCap;
  if (!dateOk || !guestsOk) {
    return (
      <PageContainer className="max-w-5xl py-10">
        <EmptyState
          title={t('checkout.missingTitle')}
          hint={
            !dateOk
              ? t('tourDetails.chooseDate')
              : t('tourDetails.guestsRange', { min: tour.minGuests, max: Math.min(tour.maxGuests, seatCap) })
          }
          action={<Link to={`/tour/${tour.id}`}><Button>{t('tourCard.details')}</Button></Link>}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-5xl py-8 md:py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{t('checkout.title')}</h1>
      <p className="mt-1.5 text-slate-500">{tour.title} · {formatDateStr(date)} · {t('bookings.guestsSuffix', { count: partyCount })}</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
        <Steps steps={[t('checkout.contact'), t('checkout.travelers', { count: partyCount }), t('checkout.payment')]} current={0} />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2.5 font-semibold tracking-tight text-slate-900">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-700 text-xs font-bold text-white" aria-hidden>1</span>
              {t('checkout.contact')}
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={t('checkout.fullName')} error={errors.customerName?.message}>
                <Input {...register('customerName')} placeholder={t('checkout.fullNamePlaceholder')} autoComplete="name" />
              </Field>
              <Field label={t('checkout.phone')} error={errors.customerPhone?.message}>
                <Input {...register('customerPhone')} placeholder="0901234567" inputMode="tel" autoComplete="tel" />
              </Field>
              <div className="md:col-span-2">
                <Field label={t('checkout.email')} error={errors.customerEmail?.message}>
                  <Input {...register('customerEmail')} placeholder="you@example.com" inputMode="email" autoComplete="email" />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label={t('checkout.note')}>
                  <Textarea {...register('note')} rows={3} maxLength={1000} placeholder={t('checkout.notePlaceholder')} />
                </Field>
              </div>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2.5 font-semibold tracking-tight text-slate-900">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-700 text-xs font-bold text-white" aria-hidden>2</span>
              {t('checkout.travelers', { count: fields.length })}
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">{t('checkout.travelersHint')}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <span id="co-adults-label" className="mb-1 block text-xs font-medium text-slate-500">
                  {t('tourDetails.adults', { defaultValue: 'Người lớn' }) as string} · {formatCurrency(tour.price)}
                </span>
                <QuantityStepper
                  value={adults}
                  min={1}
                  max={Math.max(tour.minGuests, Math.min(tour.maxGuests, seatCap))}
                  onChange={(n) => {
                    const hi = Math.max(tour.minGuests, Math.min(tour.maxGuests, seatCap));
                    const na = Math.min(Math.max(n, 1), hi);
                    setAdults(na);
                    setChildren((c) => Math.min(c, Math.max(0, hi - na)));
                  }}
                  decreaseLabel={t('tourDetails.decreaseGuests')}
                  increaseLabel={t('tourDetails.increaseGuests')}
                  labelledBy="co-adults-label"
                />
              </div>
              {hasChildPrice && (
                <div>
                  <span id="co-children-label" className="mb-1 block text-xs font-medium text-slate-500">
                    {t('tourDetails.children', { defaultValue: 'Trẻ em' }) as string} · {formatCurrency(childPrice)}
                  </span>
                  <QuantityStepper
                    value={children}
                    min={0}
                    max={Math.max(0, Math.max(tour.minGuests, Math.min(tour.maxGuests, seatCap)) - adults)}
                    onChange={(n) => setChildren(Math.max(0, n))}
                    decreaseLabel={t('tourDetails.decreaseGuests')}
                    increaseLabel={t('tourDetails.increaseGuests')}
                    labelledBy="co-children-label"
                  />
                </div>
              )}
            </div>
            <div className="mt-4 space-y-4">
              {fields.map((f, i) => {
                const isChildRow = i >= adults;
                return (
                  <div key={f.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-xs font-bold tabular-nums text-orange-700" aria-hidden>{i + 1}</span>
                      {t('checkout.travelerName', { index: i + 1 })}
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${isChildRow ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-600'}`}>
                        {isChildRow
                          ? (t('tourDetails.children', { defaultValue: 'Trẻ em' }) as string)
                          : (t('tourDetails.adults', { defaultValue: 'Người lớn' }) as string)}
                      </span>
                    </p>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                      <Field label={t('checkout.fullName')} error={errors.guestsList?.[i]?.fullName?.message}>
                        <Input {...register(`guestsList.${i}.fullName`)} placeholder={t('checkout.fullName')} autoComplete="off" />
                      </Field>
                      <Field label={t('checkout.travelerPhone')}>
                        <Input {...register(`guestsList.${i}.phone`)} placeholder="09..." inputMode="tel" autoComplete="off" />
                      </Field>
                      <Field label={t('checkout.travelerEmail')} error={errors.guestsList?.[i]?.email?.message}>
                        <Input {...register(`guestsList.${i}.email`)} placeholder="email@example.com" inputMode="email" autoComplete="off" />
                      </Field>
                    </div>
                    {isChildRow && (
                      <div className="mt-3">
                        <Field label={t('bookings.childDob', { defaultValue: 'Ngày sinh của trẻ' }) as string}>
                          <Input type="date" {...register(`guestsList.${i}.dob`)} max={todayLocalInput()} />
                        </Field>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {tourAddons.length > 0 && (
            <Card className="p-5 sm:p-6">
              <h2 className="flex items-center gap-2.5 font-semibold tracking-tight text-slate-900">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-700 text-xs font-bold text-white" aria-hidden>
                  <TicketPercent className="h-3.5 w-3.5" aria-hidden />
                </span>
                {t('checkout.addons', { defaultValue: 'Dịch vụ bổ sung' }) as string}
              </h2>
              <div className="mt-4 space-y-2.5">
                {tourAddons.map((a) => {
                  const checked = addonIds.includes(a.id);
                  return (
                    <label
                      key={a.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors focus-within:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 ${
                        checked ? 'border-orange-700 bg-orange-50/60 ring-1 ring-orange-700' : 'border-slate-200 hover:border-orange-300 active:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAddon(a.id)}
                        className="h-4 w-4 shrink-0 rounded border-slate-300 accent-orange-700"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-800">{a.name}</span>
                        <span className="mt-0.5 block text-xs text-slate-400">
                          {a.perPerson
                            ? (t('checkout.addonPerPerson', { defaultValue: 'Tính theo khách' }) as string)
                            : (t('checkout.addonPerBooking', { defaultValue: 'Tính theo booking' }) as string)}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-slate-900">+{formatCurrency(a.price)}</span>
                    </label>
                  );
                })}
              </div>
            </Card>
          )}

          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2.5 font-semibold tracking-tight text-slate-900">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-700 text-xs font-bold text-white" aria-hidden>3</span>
              {t('checkout.payment')}
            </h2>
            <div className="mt-4 space-y-2.5" role="radiogroup" aria-label={t('checkout.payment')}>
              {(['BANK_TRANSFER', 'CARD', 'CASH'] as const).map((m) => {
                const Icon = paymentIcon(m);
                const selected = paymentMethod === m;
                return (
                  <label
                    key={m}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-orange-700 ${
                      selected ? 'border-orange-700 bg-orange-50/60 ring-1 ring-orange-700' : 'border-slate-200 hover:border-orange-300 active:bg-slate-50'
                    }`}
                  >
                    <input type="radio" value={m} {...register('paymentMethod')} className="h-4 w-4 shrink-0 accent-orange-700" />
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-orange-700 text-white' : 'bg-slate-100 text-slate-500'}`} aria-hidden>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-medium text-slate-800">
                      {paymentLabel(m)}
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
              {t('checkout.gatewayNote')}
            </p>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="p-5 sm:p-6 lg:sticky lg:top-24">
            <h2 className="font-semibold tracking-tight text-slate-900">{t('checkout.summary')}</h2>
            <div className="mt-4 flex gap-3 border-b border-slate-100 pb-4">
              <img src={tour.images[0]} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{tour.title}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDateStr(date)} · {t('bookings.guestsSuffix', { count: partyCount })}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <dt>{t('tourDetails.adults', { defaultValue: 'Người lớn' }) as string} × {adults}</dt>
                <dd className="tabular-nums">{formatCurrency(adultTotal)}</dd>
              </div>
              {children > 0 && (
                <div className="flex justify-between text-slate-600">
                  <dt>{t('tourDetails.children', { defaultValue: 'Trẻ em' }) as string} × {children}</dt>
                  <dd className="tabular-nums">{formatCurrency(childTotal)}</dd>
                </div>
              )}
              {tourAddons
                .filter((a) => addonIds.includes(a.id))
                .map((a) => (
                  <div key={a.id} className="flex justify-between text-slate-600">
                    <dt className="max-w-45 truncate" title={a.name}>+ {a.name}</dt>
                    <dd className="tabular-nums">+{formatCurrency(a.perPerson ? a.price * partyCount : a.price)}</dd>
                  </div>
                ))}
              {discount > 0 && (
                <div className="flex justify-between font-medium text-emerald-600">
                  <dt className="flex items-center gap-1.5"><TicketPercent className="h-4 w-4" aria-hidden />{t('checkout.discount')}</dt>
                  <dd className="tabular-nums">-{formatCurrency(discount)}</dd>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-base font-bold text-slate-900">
                <dt>{t('checkout.total')}</dt>
                <dd className="tabular-nums text-orange-700">{formatCurrency(total)}</dd>
              </div>
            </dl>
            <div className="mt-4 flex gap-2">
              <Input
                value={coupon}
                onChange={(e) => {
                  setCoupon(e.target.value.toUpperCase());
                  // The displayed discount belongs to the previous code — clear it
                  // so the summary can never show a total the backend won't charge.
                  setDiscount(0);
                  setCouponMsg('');
                }}
                placeholder={t('checkout.couponPlaceholder')}
                aria-label={t('checkout.couponPlaceholder')}
                className="uppercase"
              />
              <Button type="button" variant="secondary" onClick={applyCoupon} className="shrink-0">{t('checkout.apply')}</Button>
            </div>
            {couponMsg && (
              <p role="status" className={`mt-2 flex items-start gap-1.5 text-xs leading-relaxed ${discount > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                {discount > 0 && <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
                <span>{couponMsg}</span>
              </p>
            )}
            <Button type="submit" isLoading={submitting} className="mt-5 w-full py-3">
              {submitting ? t('checkout.processing') : t('checkout.confirm', { total: formatCurrency(total) })}
            </Button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-orange-700" aria-hidden />
              {t('tourDetails.noCharge')}
            </p>
          </Card>
        </div>
      </form>
    </PageContainer>
  );
}
