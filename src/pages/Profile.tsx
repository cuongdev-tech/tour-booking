import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import axios from 'axios';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Bell, CalendarDays, Heart, History } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { useEnumLabels } from '../i18n/enums';
import { formatDateStr } from '../i18n/format';
import { formatCurrency, type Booking, type Favorite } from '../types';
import { Button, Card, Field, Input, PageContainer, RetryState, SafeImage, Skeleton, StatusBadge } from '../components/ui/kit';
import { startOfTodayUtc, toUtcDay } from '../utils/date';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = window.atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function PushSettings() {
  const supported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    supported ? Notification.permission : 'unsupported',
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) return;
    let alive = true;
    api
      .get('/push/mine')
      .then((r) => {
        if (!alive) return;
        const d = r.data;
        const list = Array.isArray(d) ? d : (d.subscriptions ?? d.data ?? []);
        setSubscribed(Array.isArray(list) ? list.length > 0 : Boolean(d.subscribed ?? d.endpoint));
      })
      .catch(() => undefined);
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (alive && sub) setSubscribed(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [supported]);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        toast.error('Bạn chưa cho phép nhận thông báo');
        return;
      }
      const { data } = await api.get('/push/vapid-key');
      const publicKey = data?.publicKey as string | null;
      if (!publicKey) {
        toast.error('Máy chủ chưa cấu hình push (thiếu VAPID key)');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      // Reuse an existing subscription (double-subscribe throws InvalidStateError).
      const existing = await reg.pushManager.getSubscription().catch(() => null);
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));
      const json = sub.toJSON();
      await api.post('/push/subscribe', {
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
      });
      setSubscribed(true);
      toast.success('Đã bật thông báo đẩy');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Bật thông báo thất bại'));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      // serviceWorker.ready may hang when no SW is registered (dev) — race it.
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 3000)),
      ]).catch(() => null);
      const sub = await reg?.pushManager.getSubscription().catch(() => null);
      const endpoint = sub?.endpoint ?? '';
      if (endpoint) {
        // Query fallback: some servers/proxies drop DELETE bodies.
        await api
          .delete('/push/unsubscribe', { data: { endpoint }, params: { endpoint } })
          .catch(() => undefined);
      }
      await sub?.unsubscribe().catch(() => undefined);
      setSubscribed(false);
      toast.success('Đã tắt thông báo đẩy');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Tắt thông báo thất bại'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="flex items-center gap-2 font-semibold tracking-tight text-slate-900">
        <Bell className="h-4 w-4 text-orange-700" aria-hidden />
        Thông báo đẩy
      </h2>
      {!supported ? (
        <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Trình duyệt này không hỗ trợ thông báo đẩy.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-slate-500">
            Trạng thái: {subscribed ? 'Đang bật' : 'Đang tắt'}
            {permission !== 'unsupported' && ` · Quyền trình duyệt: ${permission}`}
          </p>
          {subscribed ? (
            <Button variant="secondary" className="mt-3" isLoading={busy} onClick={() => void disable()}>Tắt thông báo</Button>
          ) : (
            <Button className="mt-3" isLoading={busy} onClick={() => void enable()}>Bật thông báo</Button>
          )}
        </>
      )}
    </Card>
  );
}

export function Profile() {
  const { t } = useTranslation();
  useDocumentMeta(t('profile.title'));
  const labels = useEnumLabels();
  const { user, updateProfile } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loyalty, setLoyalty] = useState<{ points: number; referralCode: string } | null>(null);

  useEffect(() => {
    if (!user || user.role !== 'CUSTOMER') return;
    api.get('/loyalty/me').then((r) => setLoyalty(r.data)).catch(() => undefined);
  }, [user]);

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().min(2, t('validation.nameRequired')),
        phone: z
          .string()
          .regex(/^[0-9+\s-]{8,20}$/, t('validation.phoneInvalid'))
          .refine((s) => s === '' || (s.match(/[0-9]/g) ?? []).length >= 6, t('validation.phoneInvalid'))
          .optional()
          .or(z.literal('')),
      }),
    [t],
  );

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    values: { name: user?.name ?? '', phone: user?.phone ?? '' },
  });

  useEffect(() => {
    if (user) reset({ name: user.name, phone: user.phone ?? '' });
  }, [user, reset]);

  useEffect(() => {
    if (!user || user.role !== 'CUSTOMER') {
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setLoadFailed(false);
    Promise.all([
      api.get('/bookings/mine', { signal: ctrl.signal }).then((r) => setBookings(r.data.data)),
      api.get('/favorites', { signal: ctrl.signal }).then((r) => setFavorites(r.data.data)),
    ])
      .catch((err) => {
        if (axios.isAxiosError(err) && err.code === 'ERR_CANCELED') return;
        setLoadFailed(true);
        toast.error(apiErrorMessage(err, t('tours.loadError')));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [user, reset, t]);

  if (!user) return null;
  // UTC calendar-day frame, same as the backend (see utils/date).
  const todayStart = startOfTodayUtc();
  const isUpcoming = (b: Booking) => {
    const day = toUtcDay(b.travelDate);
    return (
      ['PENDING', 'CONFIRMED'].includes(b.bookingStatus) &&
      !Number.isNaN(day) &&
      day >= todayStart
    );
  };
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
          {loyalty && (
            <div className="mt-5 space-y-2 rounded-xl bg-amber-50 p-4 text-sm border border-amber-200">
              <p className="font-bold text-amber-800">Điểm loyalty: {loyalty.points} (≈ {(loyalty.points * 1000).toLocaleString('vi-VN')}₫)</p>
              <p className="text-xs text-amber-700">Mã giới thiệu của bạn: <span className="font-mono font-bold">{loyalty.referralCode}</span></p>
              <button
                type="button"
                onClick={() => {
                  const link = `${window.location.origin}/register?ref=${encodeURIComponent(loyalty.referralCode)}`;
                  if (!navigator.clipboard?.writeText) {
                    window.prompt('Copy link giới thiệu:', link);
                    return;
                  }
                  navigator.clipboard.writeText(link).then(() => toast.success('Đã copy link giới thiệu')).catch(() => toast.error('Copy thất bại'));
                }}
                className="text-xs font-semibold text-amber-800 underline"
              >
                Copy link giới thiệu
              </button>
            </div>
          )}
        </Card>

        <div className="space-y-6 lg:col-span-3">
          {loadFailed && !loading && (
            <RetryState
              title={t('tours.loadError')}
              onRetry={() => {
                if (!user) return;
                const ctrl = new AbortController();
                setLoading(true);
                setLoadFailed(false);
                Promise.all([
                  api.get('/bookings/mine', { signal: ctrl.signal }).then((r) => setBookings(r.data.data)),
                  api.get('/favorites', { signal: ctrl.signal }).then((r) => setFavorites(r.data.data)),
                ])
                  .catch((err) => {
                    if (axios.isAxiosError(err) && err.code === 'ERR_CANCELED') return;
                    setLoadFailed(true);
                    toast.error(apiErrorMessage(err, t('tours.loadError')));
                  })
                  .finally(() => setLoading(false));
              }}
              retryLabel={t('tours.retry')}
            />
          )}
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
          <PushSettings />
        </div>
      </div>
    </PageContainer>
  );
}
