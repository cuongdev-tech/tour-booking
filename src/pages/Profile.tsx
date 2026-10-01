import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, CalendarDays, Heart, History } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { useEnumLabels } from '../i18n/enums';
import { formatDateStr } from '../i18n/format';
import { formatCurrency, type Booking, type Favorite } from '../types';
import { Button, Card, Field, Input, PageContainer, SafeImage, Skeleton, StatusBadge } from '../components/ui/kit';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

export function Profile() {
  const { t } = useTranslation();
  useDocumentMeta(t('profile.title'));
  const labels = useEnumLabels();
  const { user, updateProfile } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().min(2, t('validation.nameRequired')),
        phone: z.string().regex(/^[0-9+\s-]{8,20}$/, t('validation.phoneInvalid')).optional().or(z.literal('')),
      }),
    [t],
  );

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    values: { name: user?.name ?? '', phone: user?.phone ?? '' },
  });

  useEffect(() => {
    if (user) reset({ name: user.name, phone: user.phone ?? '' });
    setLoading(true);
    Promise.all([
      api.get('/bookings/mine').then((r) => setBookings(r.data.data)),
      api.get('/favorites').then((r) => setFavorites(r.data.data)),
    ])
      .catch((err) => toast.error(apiErrorMessage(err, t('tours.loadError'))))
      .finally(() => setLoading(false));
  }, [user, reset, t]);

  if (!user) return null;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const isUpcoming = (b: Booking) =>
    ['PENDING', 'CONFIRMED'].includes(b.bookingStatus) &&
    !Number.isNaN(new Date(b.travelDate).getTime()) &&
    new Date(b.travelDate).getTime() >= todayStart.getTime();
  // "Upcoming" means bookable-status AND travel day not passed (a stale PENDING
  // from last month is history, not upcoming).
  const upcoming = bookings.filter(isUpcoming);
  const past = bookings.filter((b) => !isUpcoming(b));
  const visibleFavorites = favorites.filter((f) => f.tour?.status !== 'INACTIVE');

  const bookingRow = (b: Booking) => (
    <Link
      key={b.id}
      to={`/booking-success/${b.bookingCode}`}
      className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 text-sm transition-colors hover:border-orange-200 hover:bg-orange-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-900">{b.tour?.title}</p>
        <p className="mt-0.5 truncate tabular-nums text-slate-500">{formatDateStr(b.travelDate)} · {formatCurrency(b.total)}</p>
      </div>
      <StatusBadge status={b.bookingStatus} />
    </Link>
  );

  return (
    <PageContainer className="py-8 md:py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{t('profile.title')}</h1>
      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-4">
        <Card className="p-6 lg:col-span-1 lg:sticky lg:top-24">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-orange-700 text-2xl font-bold text-white" aria-hidden>
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{user.name}</p>
              <p className="truncate text-sm text-slate-500">{user.email}</p>
              <p className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                {labels.role(user.role)}
              </p>
            </div>
          </div>
          <form
            className="mt-5 space-y-3 border-t border-slate-100 pt-5"
            onSubmit={handleSubmit(async (v) => {
              try {
                // Send '' (not undefined) when cleared so the backend nulls the stored phone.
                await updateProfile({ name: v.name, phone: v.phone?.trim() ? v.phone : '' });
                toast.success(t('profile.saved'));
              } catch (err) {
                toast.error(apiErrorMessage(err, t('profile.updateFailed')));
              }
            })}
          >
            <Field label={t('profile.name')} error={errors.name?.message}><Input id="profile-name" {...register('name')} autoComplete="name" /></Field>
            <Field label={t('profile.phone')} error={errors.phone?.message}><Input id="profile-phone" {...register('phone')} inputMode="tel" autoComplete="tel" /></Field>
            <Button type="submit" isLoading={isSubmitting} className="w-full">{t('profile.save')}</Button>
          </form>
        </Card>

        <div className="space-y-6 lg:col-span-3">
          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-semibold tracking-tight text-slate-900">
              <CalendarDays className="h-4 w-4 text-orange-700" aria-hidden />
              {t('profile.upcoming', { count: upcoming.length })}
            </h2>
            {loading ? (
              <Skeleton className="mt-4 h-20" />
            ) : upcoming.length === 0 ? (
              <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                {t('profile.noUpcoming')}{' '}
                <Link to="/tours" className="inline-flex items-center gap-1 rounded font-semibold text-orange-700 transition-colors hover:text-orange-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700">
                  {t('profile.exploreTours')} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </p>
            ) : (
              <div className="mt-4 space-y-2.5">
                {upcoming.map(bookingRow)}
              </div>
            )}
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-semibold tracking-tight text-slate-900">
              <History className="h-4 w-4 text-orange-700" aria-hidden />
              {t('profile.history', { count: past.length })}
            </h2>
            {loading ? (
              <Skeleton className="mt-4 h-20" />
            ) : past.length === 0 ? (
              <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{t('profile.noHistory')}</p>
            ) : (
              <div className="mt-4 space-y-2.5">
                {past.map(bookingRow)}
              </div>
            )}
          </Card>
          <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-semibold tracking-tight text-slate-900">
                <Heart className="h-4 w-4 text-orange-700" aria-hidden />
                {t('profile.favorites', { count: visibleFavorites.length })}
              </h2>
              {visibleFavorites.length > 0 && !loading && (
                <Link to="/favorites" className="inline-flex items-center gap-1 rounded text-sm font-semibold text-orange-700 transition-colors hover:text-orange-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700">
                  {t('profile.viewAll')} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              )}
            </div>
            {loading ? (
              <Skeleton className="mt-4 h-20" />
            ) : visibleFavorites.length === 0 ? (
              <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{t('profile.noFavorites')}</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {visibleFavorites.slice(0, 4).map((f) => (
                  <Link
                    key={f.id}
                    to={`/tour/${f.tourId}`}
                    className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 transition-colors hover:border-orange-200 hover:bg-orange-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                  >
                    <SafeImage src={f.tour?.images[0]} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                    <p className="line-clamp-2 min-w-0 text-sm font-medium leading-snug text-slate-900">{f.tour?.title}</p>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
