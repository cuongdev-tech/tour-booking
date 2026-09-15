import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { formatDateStr } from '../i18n/format';
import { formatCurrency, type Booking, type Favorite } from '../types';
import { Button, Card, Field, Input, StatusBadge } from '../components/ui/kit';

export function Profile() {
  const { t } = useTranslation();
  const { user, updateProfile } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);

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
    api.get('/bookings/mine').then((r) => setBookings(r.data.data)).catch(() => undefined);
    api.get('/favorites').then((r) => setFavorites(r.data.data)).catch(() => undefined);
  }, [user, reset]);

  if (!user) return null;
  const upcoming = bookings.filter((b) => ['PENDING', 'CONFIRMED'].includes(b.bookingStatus));
  const past = bookings.filter((b) => ['COMPLETED', 'CANCELLED'].includes(b.bookingStatus));

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-slate-900">{t('profile.title')}</h1>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-4">
        <Card className="p-6 lg:col-span-1">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-teal-100 text-2xl font-bold text-teal-700">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <p className="mt-3 font-semibold text-slate-900">{user.name}</p>
          <p className="text-sm text-slate-500">{user.email}</p>
          <form
            className="mt-5 space-y-3"
            onSubmit={handleSubmit(async (v) => {
              try {
                await updateProfile({ name: v.name, phone: v.phone || undefined });
                toast.success(t('profile.saved'));
              } catch (err) {
                toast.error(apiErrorMessage(err, t('profile.updateFailed')));
              }
            })}
          >
            <Field label={t('profile.name')} error={errors.name?.message}><Input {...register('name')} /></Field>
            <Field label={t('profile.phone')} error={errors.phone?.message}><Input {...register('phone')} /></Field>
            <Button type="submit" disabled={isSubmitting} className="w-full">{t('profile.save')}</Button>
          </form>
        </Card>

        <div className="space-y-6 lg:col-span-3">
          <Card className="p-6">
            <h2 className="font-semibold text-slate-900">{t('profile.upcoming', { count: upcoming.length })}</h2>
            {upcoming.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">{t('profile.noUpcoming')} <Link to="/tours" className="font-semibold text-teal-700">{t('profile.exploreTours')}</Link></p>
            ) : (
              <div className="mt-4 space-y-3">
                {upcoming.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-sm">
                    <div>
                      <p className="font-medium text-slate-900">{b.tour?.title}</p>
                      <p className="text-slate-500">{formatDateStr(b.travelDate)} · {formatCurrency(b.total)}</p>
                    </div>
                    <StatusBadge status={b.bookingStatus} />
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-6">
            <h2 className="font-semibold text-slate-900">{t('profile.history', { count: past.length })}</h2>
            {past.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">{t('profile.noHistory')}</p>
            ) : (
              <div className="mt-4 space-y-3">
                {past.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-sm">
                    <div>
                      <p className="font-medium text-slate-900">{b.tour?.title}</p>
                      <p className="text-slate-500">{b.bookingCode} · {formatCurrency(b.total)}</p>
                    </div>
                    <StatusBadge status={b.bookingStatus} />
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">{t('profile.favorites', { count: favorites.length })}</h2>
              <Link to="/favorites" className="text-sm font-semibold text-teal-700">{t('profile.viewAll')}</Link>
            </div>
            {favorites.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">{t('profile.noFavorites')}</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {favorites.slice(0, 4).map((f) => (
                  <Link key={f.id} to={`/tour/${f.tourId}`} className="flex gap-3 rounded-xl border border-slate-100 p-3 hover:border-teal-300">
                    <img src={f.tour?.images[0]} alt="" className="h-14 w-14 rounded-lg object-cover" />
                    <p className="line-clamp-2 text-sm font-medium text-slate-900">{f.tour?.title}</p>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
