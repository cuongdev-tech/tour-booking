import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';
import { formatDateStr } from '../i18n/format';
import { formatCurrency, type Booking } from '../types';
import { Button, Card, EmptyState, Skeleton, StatusBadge } from '../components/ui/kit';

export function BookingSuccess() {
  const { t } = useTranslation();
  const { code } = useParams();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;
    api
      .get(`/bookings/code/${code}`)
      .then((res) => setBooking(res.data.booking))
      .catch(() => setBooking(null))
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) return <div className="mx-auto max-w-xl px-4 py-10"><Skeleton className="h-80" /></div>;
  if (!booking) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <EmptyState title={t('bookingSuccess.notFound')} action={<Link to="/bookings"><Button>{t('bookingSuccess.myBookings')}</Button></Link>} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <Card className="p-8 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-8 w-8" />
        </span>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">{t('bookingSuccess.title')}</h1>
        <p className="mt-1 text-slate-500">{t('bookingSuccess.codeHint')}</p>
        <p className="mt-1 text-2xl font-bold tracking-widest text-teal-700">{booking.bookingCode}</p>
        <div className="mt-6 space-y-2 rounded-xl bg-slate-50 p-4 text-left text-sm">
          <div className="flex justify-between"><span className="text-slate-500">{t('bookingSuccess.tour')}</span><span className="max-w-60 truncate font-medium">{booking.tour?.title}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">{t('bookingSuccess.travelDate')}</span><span>{formatDateStr(booking.travelDate)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">{t('bookingSuccess.guests')}</span><span>{booking.guests}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">{t('bookingSuccess.total')}</span><span className="font-bold">{formatCurrency(booking.total)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">{t('bookingSuccess.booking')}</span><StatusBadge status={booking.bookingStatus} /></div>
          <div className="flex justify-between"><span className="text-slate-500">{t('bookingSuccess.payment')}</span><StatusBadge status={booking.payment?.status ?? 'PENDING'} /></div>
        </div>
        <div className="mt-6 flex gap-2">
          <Link to="/bookings" className="flex-1"><Button className="w-full">{t('bookingSuccess.myBookings')}</Button></Link>
          <Link to="/" className="flex-1"><Button variant="secondary" className="w-full">{t('bookingSuccess.home')}</Button></Link>
        </div>
      </Card>
    </div>
  );
}
