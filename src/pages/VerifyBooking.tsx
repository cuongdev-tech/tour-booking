import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { BadgeCheck, ShieldAlert } from 'lucide-react';
import { api } from '../services/api';
import { formatDateStr } from '../i18n/format';
import { Button, Card, EmptyState, PageContainer, SafeImage, Skeleton, StatusBadge } from '../components/ui/kit';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

interface PublicTicket {
  bookingCode: string;
  tour: { id: string; title: string; images: string[]; destination: string; duration: string } | null;
  travelDate: string;
  guests: number;
  adults: number;
  children: number;
  bookingStatus: string;
  payment: { method: string; status: string } | null;
}

/**
 * Xác thực vé công khai (QR target): không cần đăng nhập, không lộ PII
 * (tên/SĐT/email khách được giấu).
 */
export function VerifyBooking() {
  const { t } = useTranslation();
  const { code } = useParams();
  const [ticket, setTicket] = useState<PublicTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useDocumentMeta(t('verify.title', { defaultValue: 'Xác thực vé' }) as string);

  useEffect(() => {
    if (!code) return;
    const ctrl = new AbortController();
    setLoading(true);
    setFailed(false);
    api
      .get(`/bookings/public/${encodeURIComponent(code)}`, { signal: ctrl.signal })
      .then((res) => setTicket(res.data.ticket))
      .catch((err) => {
        if (axios.isAxiosError(err) && err.code === 'ERR_CANCELED') return;
        setTicket(null);
        setFailed(true);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [code]);

  if (loading) return <PageContainer className="max-w-2xl py-10"><Skeleton className="h-80" /></PageContainer>;
  if (failed || !ticket) {
    return (
      <PageContainer className="max-w-2xl py-10">
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6" aria-hidden />}
          title={t('verify.notFound', { defaultValue: 'Không tìm thấy vé' }) as string}
          hint={code}
          action={<Link to="/tours"><Button>{t('checkout.browseTours')}</Button></Link>}
        />
      </PageContainer>
    );
  }

  // Đồng bộ với BookingSuccess/invoice: QR chỉ hiện khi vé dùng được
  // (không CANCELLED + đã trả/CASH) nên quét ra COMPLETED+PAID vẫn hợp lệ.
  const bookingOk =
    ticket.bookingStatus === 'CONFIRMED' ||
    ticket.bookingStatus === 'PENDING' ||
    ticket.bookingStatus === 'COMPLETED';
  const paymentOk = ticket.payment?.status === 'PAID' || ticket.payment?.method === 'CASH';
  // Quét QR ra chuyến đi: vé chỉ "hợp lệ" khi booking còn hiệu lực VÀ đã trả tiền
  // (tiền mặt trả tại điểm đón nên luôn ok). Thẻ/chuyển khoản chưa trả → báo riêng.
  const valid = bookingOk && paymentOk;
  const needPayment = bookingOk && !paymentOk;

  return (
    <PageContainer className="max-w-2xl py-10 md:py-12">
      <Card className="overflow-hidden p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className={`flex h-12 w-12 items-center justify-center rounded-full ${valid ? 'bg-emerald-100 text-emerald-600' : needPayment ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}`}>
            <BadgeCheck className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              {valid
                ? (t('verify.valid', { defaultValue: 'Vé hợp lệ' }) as string)
                : needPayment
                  ? (t('verify.needPaymentTitle', { defaultValue: 'Chưa thanh toán' }) as string)
                  : (t('verify.invalid', { defaultValue: 'Vé không còn hiệu lực' }) as string)}
            </h1>
            <p className="mt-0.5 inline-block rounded-lg bg-orange-50 px-3 py-1 font-mono text-sm font-bold tabular-nums tracking-widest text-orange-700">
              {ticket.bookingCode}
            </p>
          </div>
        </div>

        {ticket.tour?.images[0] && (
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100">
            <SafeImage src={ticket.tour.images[0]} alt="" className="h-40 w-full object-cover" />
            <p className="line-clamp-2 bg-slate-50 px-4 py-3 text-sm font-semibold leading-snug text-slate-900">{ticket.tour.title}</p>
          </div>
        )}

        <dl className="mt-4 space-y-2.5 rounded-xl bg-slate-50 p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">{t('bookingSuccess.travelDate')}</dt>
            <dd className="tabular-nums text-slate-900">{formatDateStr(ticket.travelDate)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">{t('bookingSuccess.guests')}</dt>
            <dd className="tabular-nums text-slate-900">
              {t('bookings.guestsSuffix', { count: ticket.guests })}
              {ticket.children > 0 && ` (${ticket.adults} NL · ${ticket.children} TE)`}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">{t('bookingSuccess.booking')}</dt>
            <dd><StatusBadge status={ticket.bookingStatus} /></dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">{t('bookingSuccess.payment')}</dt>
            <dd><StatusBadge status={ticket.payment?.status ?? 'PENDING'} /></dd>
          </div>
        </dl>
        <p className="mt-3 text-center text-xs text-slate-400">
          {t('verify.operatorHint', { defaultValue: 'Đối chiếu mã booking + ngày đi + số khách với danh sách đoàn.' }) as string}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Link to={ticket.tour ? `/tour/${ticket.tour.id}` : '/tours'}>
            <Button variant="secondary" className="w-full">{ticket.tour?.title ?? t('tourCard.details')}</Button>
          </Link>
          <Link to="/"><Button variant="secondary" className="w-full">{t('bookingSuccess.home')}</Button></Link>
        </div>
      </Card>
    </PageContainer>
  );
}
