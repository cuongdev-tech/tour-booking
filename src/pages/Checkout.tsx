import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../services/api';
import { useEnumLabels } from '../i18n/enums';
import { formatDateStr } from '../i18n/format';
import { formatCurrency, type Tour } from '../types';
import { Button, Card, EmptyState, Field, Input, Skeleton } from '../components/ui/kit';

export function Checkout() {
  const { t } = useTranslation();
  const labels = useEnumLabels();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tourId = params.get('tourId') ?? '';
  const date = params.get('date') ?? '';
  const guestsCount = Math.max(1, Math.min(30, Number(params.get('guests') ?? 1) || 1));

  const schema = useMemo(() => {
    const guestSchema = z.object({
      fullName: z.string().min(2, t('validation.guestNameRequired')),
      phone: z.string().optional(),
      email: z.string().email(t('validation.emailInvalid')).optional().or(z.literal('')),
    });
    return z.object({
      customerName: z.string().min(2, t('validation.fullNameRequired')),
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

  const { register, control, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      paymentMethod: 'BANK_TRANSFER',
      guestsList: Array.from({ length: guestsCount }, () => ({ fullName: '', phone: '', email: '' })),
    },
  });
  const { fields } = useFieldArray({ control, name: 'guestsList' });

  useEffect(() => {
    if (!tourId) {
      setLoading(false);
      return;
    }
    api
      .get(`/tours/${tourId}`)
      .then((res) => setTour(res.data.tour))
      .catch(() => setTour(null))
      .finally(() => setLoading(false));
  }, [tourId]);

  const subtotal = useMemo(() => (tour ? tour.price * guestsCount : 0), [tour, guestsCount]);
  const total = subtotal - discount;

  const paymentLabel = (m: 'BANK_TRANSFER' | 'CARD' | 'CASH'): string => labels.paymentMethod(m);

  const applyCoupon = async () => {
    if (!coupon.trim()) return;
    try {
      const { data } = await api.post('/coupons/validate', { code: coupon.trim(), subtotal });
      setDiscount(data.discount);
      setCouponMsg(t('checkout.couponApplied', { discount: formatCurrency(data.discount) }));
      toast.success(t('checkout.couponApplied', { discount: formatCurrency(data.discount) }));
    } catch (err) {
      setDiscount(0);
      setCouponMsg(apiErrorMessage(err, t('checkout.bookingFailed')));
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!tour || !date) {
      toast.error(t('checkout.missingInfo'));
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
        guestsList: values.guestsList.map((g) => ({
          fullName: g.fullName,
          phone: g.phone || undefined,
          email: g.email || undefined,
        })),
      });
      navigate(`/booking-success/${data.booking.bookingCode}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, t('checkout.bookingFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10"><Skeleton className="h-96" /></div>
    );
  }
  if (!tourId || !date || !tour) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <EmptyState
          title={t('checkout.missingTitle')}
          hint={t('checkout.missingHint')}
          action={<Link to="/tours"><Button>{t('checkout.browseTours')}</Button></Link>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-slate-900">{t('checkout.title')}</h1>
      <p className="mt-1 text-slate-500">{tour.title} · {formatDateStr(date)} · {t('bookings.guestsSuffix', { count: guestsCount })}</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card className="p-6">
            <h2 className="font-semibold text-slate-900">{t('checkout.contact')}</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={t('checkout.fullName')} error={errors.customerName?.message}>
                <Input {...register('customerName')} placeholder={t('checkout.fullNamePlaceholder')} />
              </Field>
              <Field label={t('checkout.phone')} error={errors.customerPhone?.message}>
                <Input {...register('customerPhone')} placeholder="0901234567" />
              </Field>
              <div className="md:col-span-2">
                <Field label={t('checkout.email')} error={errors.customerEmail?.message}>
                  <Input {...register('customerEmail')} placeholder="you@example.com" />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label={t('checkout.note')}>
                  <Input {...register('note')} placeholder={t('checkout.notePlaceholder')} />
                </Field>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="font-semibold text-slate-900">{t('checkout.travelers', { count: fields.length })}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('checkout.travelersHint')}</p>
            <div className="mt-4 space-y-4">
              {fields.map((f, i) => (
                <div key={f.id} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-100 p-4 md:grid-cols-3">
                  <Field label={t('checkout.travelerName', { index: i + 1 })} error={errors.guestsList?.[i]?.fullName?.message}>
                    <Input {...register(`guestsList.${i}.fullName`)} placeholder={t('checkout.fullName')} />
                  </Field>
                  <Field label={t('checkout.travelerPhone')}>
                    <Input {...register(`guestsList.${i}.phone`)} placeholder="09..." />
                  </Field>
                  <Field label={t('checkout.travelerEmail')} error={errors.guestsList?.[i]?.email?.message}>
                    <Input {...register(`guestsList.${i}.email`)} placeholder="email@example.com" />
                  </Field>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="font-semibold text-slate-900">{t('checkout.payment')}</h2>
            <div className="mt-4 space-y-2">
              {(['BANK_TRANSFER', 'CARD', 'CASH'] as const).map((m) => (
                <label key={m} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-4 hover:border-teal-400">
                  <input type="radio" value={m} {...register('paymentMethod')} className="h-4 w-4 text-teal-600" />
                  <span className="text-sm font-medium text-slate-800">
                    {paymentLabel(m)}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              {t('checkout.gatewayNote')}
            </p>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="p-6 lg:sticky lg:top-24">
            <h2 className="font-semibold text-slate-900">{t('checkout.summary')}</h2>
            <div className="mt-4 flex gap-3 border-b border-slate-100 pb-4">
              <img src={tour.images[0]} alt="" className="h-20 w-20 rounded-xl object-cover" />
              <div>
                <p className="line-clamp-2 text-sm font-semibold text-slate-900">{tour.title}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDateStr(date)} · {t('bookings.guestsSuffix', { count: guestsCount })}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between text-slate-600"><span>{t('checkout.subtotal')}</span><span>{formatCurrency(subtotal)}</span></div>
              {discount > 0 && (
                <div className="flex justify-between text-emerald-600"><span>{t('checkout.discount')}</span><span>-{formatCurrency(discount)}</span></div>
              )}
              <div className="flex justify-between border-t border-slate-100 pt-3 text-base font-bold text-slate-900">
                <span>{t('checkout.total')}</span><span className="text-teal-700">{formatCurrency(total)}</span>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder={t('checkout.couponPlaceholder')} />
              <Button type="button" variant="secondary" onClick={applyCoupon}>{t('checkout.apply')}</Button>
            </div>
            {couponMsg && <p className="mt-2 text-xs text-slate-500">{couponMsg}</p>}
            <Button type="submit" disabled={submitting} className="mt-5 w-full bg-orange-500 py-3 hover:bg-orange-600">
              {submitting ? t('checkout.processing') : t('checkout.confirm', { total: formatCurrency(total) })}
            </Button>
          </Card>
        </div>
      </form>
    </div>
  );
}
