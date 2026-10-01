import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { CheckCircle2, Download, QrCode, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../services/api';
import { downloadInvoice } from '../services/invoice';
import { formatDateStr } from '../i18n/format';
import { formatCurrency, type Booking } from '../types';
import { useEnumLabels } from '../i18n/enums';
import { Button, Card, EmptyState, Modal, PageContainer, SafeImage, Skeleton, StatusBadge } from '../components/ui/kit';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

export function BookingSuccess() {
  const { t } = useTranslation();
  const labels = useEnumLabels();
  const { code } = useParams();
  const location = useLocation();
  // Bookings/Profile link here to re-view an old booking — only celebrate when
  // arriving straight from a fresh checkout.
  const fresh = (location.state as { fresh?: boolean } | null)?.fresh === true;
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [qr, setQr] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [payInfo, setPayInfo] = useState<{ bankName: string; accountNumber: string; accountName: string; demo: boolean } | null>(null);
  const [payInfoFailed, setPayInfoFailed] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const prevPayStatus = useRef<string | null>(null);
  useDocumentMeta(t('bookingSuccess.title'), t('bookingSuccess.codeHint'));

  useEffect(() => {
    if (!code) return;
    const ctrl = new AbortController();
    setLoading(true);
    api
      .get(`/bookings/code/${code}`, { signal: ctrl.signal })
      .then((res) => setBooking(res.data.booking))
      .catch((err) => {
        if (axios.isAxiosError(err) && err.code === 'ERR_CANCELED') return;
        setBooking(null);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [code, attempt]);

  // Đổi booking khác (cùng component) thì reset hết state của booking cũ.
  useEffect(() => {
    setClaimed(false);
    setClaiming(false);
    setPayOpen(false);
    setPayInfo(null);
    setPayInfoFailed(false);
    prevPayStatus.current = null;
  }, [code]);

  // QR vé điện tử trỏ tới trang verify công khai (quét không cần đăng nhập).
  // Chỉ tạo khi vé đã dùng được (PAID hoặc CASH) —Lazy-load để không phình bundle.
  useEffect(() => {
    const usable =
      booking &&
      booking.bookingStatus !== 'CANCELLED' &&
      (booking.payment?.status === 'PAID' || booking.payment?.method === 'CASH');
    if (!usable || !booking) {
      setQr('');
      return;
    }
    const url = `${window.location.origin}/verify/${booking.bookingCode}`;
    let alive = true;
    import('qrcode')
      .then((m) => m.default.toDataURL(url, { width: 220, margin: 1 }))
      .then((data) => {
        if (alive) setQr(data);
      })
      .catch(() => {
        if (alive) setQr('');
      });
    return () => {
      alive = false;
    };
  }, [booking]);

  // Poll chờ admin xác nhận đã nhận tiền: PENDING/AWAITING/FAILED -> PAID thì
  // báo thành công và hiện QR vé (không cần F5). FAILED vẫn poll để admin
  // reset về PENDING rồi duyệt cũng tự hiện.
  useEffect(() => {
    const pay = booking?.payment;
    const waiting =
      booking &&
      pay &&
      (pay.status === 'PENDING' || pay.status === 'AWAITING_CONFIRMATION' || pay.status === 'FAILED') &&
      pay.method !== 'CASH' &&
      booking.bookingStatus !== 'CANCELLED';
    if (!waiting || !booking) return;
    if (prevPayStatus.current === null) prevPayStatus.current = pay?.status ?? 'PENDING';
    const id = window.setInterval(() => {
      api
        .get(`/bookings/code/${booking.bookingCode}`)
        .then((res) => {
          const next = res.data.booking as Booking;
          const before = prevPayStatus.current;
          const after = next.payment?.status ?? 'PENDING';
          prevPayStatus.current = after;
          // Chỉ set state khi có gì đổi (tránh regen QR vé mỗi 10s).
          if (after !== before || next.bookingStatus !== booking.bookingStatus || next.total !== booking.total) {
            setBooking(next);
          }
          if (after === 'PAID' && before !== 'PAID') {
            setPayOpen(false);
            toast.success(t('pay.paid', { defaultValue: 'Thanh toán thành công' }) as string);
          } else if (after === 'FAILED' && before !== 'FAILED') {
            toast.error(t('pay.rejected', { defaultValue: 'Chuyển khoản chưa được ghi nhận, vui lòng kiểm tra lại.' }) as string);
          }
        })
        .catch(() => undefined);
    }, 10000);
    return () => window.clearInterval(id);
  }, [booking?.id, booking?.payment?.status, booking?.bookingCode, booking?.payment?.method, booking?.bookingStatus, t]);

  if (loading) return <PageContainer className="max-w-3xl py-10"><Skeleton className="h-96" /></PageContainer>;
  if (!booking) {
    return (
      <PageContainer className="max-w-3xl py-10">
        <EmptyState
          title={t('bookingSuccess.notFound')}
          hint={code}
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="secondary" onClick={() => setAttempt((a) => a + 1)}>{t('tours.retry')}</Button>
              <Link to="/bookings"><Button>{t('bookingSuccess.myBookings')}</Button></Link>
            </div>
          }
        />
      </PageContainer>
    );
  }

  const childCount = booking.children ?? 0;
  const adultCount = booking.adults ?? booking.guests - childCount;
  const bookingAddons = Array.isArray(booking.addons) ? booking.addons : [];
  const adultFare = adultCount * (booking.tour?.price ?? 0);
  const rows: Array<[string, React.ReactNode]> = [
    [t('bookingSuccess.tour'), <span key="tour" className="max-w-60 truncate text-right font-medium text-slate-900" title={booking.tour?.title}>{booking.tour?.title}</span>],
    [t('bookingSuccess.travelDate'), <span key="date" className="tabular-nums text-slate-900">{formatDateStr(booking.travelDate)}</span>],
    [t('bookingSuccess.guests'), <span key="guests" className="tabular-nums text-slate-900">{t('bookings.guestsSuffix', { count: booking.guests })}{childCount > 0 && ` (${adultCount} NL · ${childCount} TE)`}</span>],
    ...(childCount > 0 && booking.tour
      ? ([
          [`${t('tourDetails.adults', { defaultValue: 'Người lớn' })} × ${adultCount}`, <span key="ad" className="tabular-nums text-slate-900">{formatCurrency(adultFare)}</span>],
          [`${t('tourDetails.children', { defaultValue: 'Trẻ em' })} × ${childCount}`, <span key="ch" className="tabular-nums text-slate-900">{formatCurrency(Math.max(0, booking.subtotal - adultFare))}</span>],
        ] as Array<[string, React.ReactNode]>)
      : []),
    ...bookingAddons.map(
      (a) =>
        [`+ ${a.name}`, <span key={`addon-${a.id}`} className="tabular-nums text-slate-900">+{formatCurrency(a.perPerson ? a.price * booking.guests : a.price)}</span>] as [
          string,
          React.ReactNode,
        ],
    ),
    [t('bookingSuccess.total'), <span key="total" className="font-bold tabular-nums text-orange-700">{formatCurrency(booking.total)}</span>],
    [t('bookingSuccess.booking'), <StatusBadge key="bs" status={booking.bookingStatus} />],
    [t('bookingSuccess.payment'), <StatusBadge key="ps" status={booking.payment?.status ?? 'PENDING'} />],
  ];

  // Vé QR chỉ có hiệu lực khi đã trả tiền (hoặc tiền mặt trả tại điểm đón).
  // CARD/BANK_TRANSFER còn PENDING/FAILED thì phải thanh toán xong mới nhận vé.
  const ticketUsable =
    booking.bookingStatus !== 'CANCELLED' &&
    (booking.payment?.status === 'PAID' || booking.payment?.method === 'CASH');

  // FAILED vẫn cho mở lại QR để thử lại (admin reset FAILED->PENDING rồi duyệt
  // cũng tự hiện nhờ poll).
  const canPay =
    (booking.payment?.status === 'PENDING' || booking.payment?.status === 'FAILED') &&
    booking.payment.method !== 'CASH' &&
    booking.bookingStatus !== 'CANCELLED';

  const openPay = () => {
    setPayOpen(true);
    if (!payInfo && !payInfoFailed) {
      api
        .get('/bookings/payment-info')
        .then((res) => setPayInfo(res.data))
        .catch(() => setPayInfoFailed(true));
    }
  };

  // VietQR: path encode từng đoạn, nội dung chỉ giữ chữ+số (ngân hàng cắt ký tự lạ).
  const vietQrUrl = payInfo
    ? `https://img.vietqr.io/image/${encodeURIComponent(payInfo.bankName)}-${encodeURIComponent(payInfo.accountNumber)}-compact2.png?amount=${booking.total}&addInfo=${booking.bookingCode.replace(/[^A-Za-z0-9]/g, '')}&accountName=${encodeURIComponent(payInfo.accountName)}`
    : '';

  return (
    <PageContainer className="max-w-3xl py-10 md:py-12">
      <Card className="overflow-hidden p-6 sm:p-8">
        <div className="grid items-start gap-8 md:grid-cols-[1fr_1.1fr]">
          <div className="text-center md:text-left">
            {fresh && (
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 md:mx-0">
                <CheckCircle2 className="h-8 w-8" aria-hidden />
              </span>
            )}
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
              {fresh ? t('bookingSuccess.title') : t('bookings.details')}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{t('bookingSuccess.codeHint')}</p>
            <p className="mt-2 inline-block rounded-xl bg-orange-50 px-4 py-2 text-2xl font-bold tabular-nums tracking-widest text-orange-700">{booking.bookingCode}</p>
            {/* Vé QR: chỉ hiện khi đã trả tiền (hoặc tiền mặt) — quét ra vé chuyến đi */}
            {ticketUsable && qr && (
              <div className="mt-4 flex flex-col items-center gap-1.5 md:items-start">
                <img src={qr} alt="QR" className="h-36 w-36 rounded-2xl border border-slate-200 bg-white p-2" />
                <Link
                  to={`/verify/${booking.bookingCode}`}
                  className="inline-flex items-center gap-1 rounded text-xs font-semibold text-orange-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                >
                  <QrCode className="h-3.5 w-3.5" aria-hidden />
                  {t('verify.title', { defaultValue: 'Xác thực vé' }) as string}
                </Link>
              </div>
            )}
            {ticketUsable && !qr && (
              <p className="mt-4 text-xs text-slate-400">
                {t('verify.generating', { defaultValue: 'Đang tạo mã QR vé...' }) as string}
              </p>
            )}
            {!ticketUsable && (
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-700">
                {t('verify.needPayment', { defaultValue: 'Hoàn tất thanh toán để nhận mã QR vé điện tử.' }) as string}
              </p>
            )}
            {/* Thanh toán: bấm để hiện QR, quét xong chờ admin xác nhận */}
            {canPay && (
              <div className="mt-4 rounded-2xl border border-dashed border-orange-300 bg-orange-50/50 p-4 text-left">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <Wallet className="h-4 w-4 text-orange-700" aria-hidden />
                  {t('checkout.payment')}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {t('pay.scanHint', { defaultValue: 'Quét mã QR để chuyển khoản đúng số tiền và nội dung.' }) as string}
                </p>
                <Button className="mt-3 w-full" onClick={openPay}>
                  {t('pay.payNow', { defaultValue: 'Thanh toán' }) as string} · {formatCurrency(booking.total)}
                </Button>
                {(booking.payment?.status === 'AWAITING_CONFIRMATION' ||
                  (claimed && booking.payment?.status === 'PENDING')) && (
                  <p role="status" className="mt-2 text-xs leading-relaxed text-amber-700">
                    {t('pay.waiting', { defaultValue: 'Đã ghi nhận, đang chờ shop xác nhận đã nhận tiền...' }) as string}
                  </p>
                )}
              </div>
            )}
            <div className="mt-6 flex flex-col gap-2">
              <Link to="/bookings"><Button className="w-full">{t('bookingSuccess.myBookings')}</Button></Link>
              <Button
                variant="secondary"
                className="w-full"
                isLoading={downloading}
                onClick={() => {
                  if (!booking) return;
                  setDownloading(true);
                  downloadInvoice(booking, {
                    bookingStatus: labels.bookingStatus(booking.bookingStatus),
                    paymentStatus: labels.paymentStatus(booking.payment?.status ?? 'PENDING'),
                  })
                    .catch((err) => toast.error(apiErrorMessage(err, t('tours.loadError'))))
                    .finally(() => setDownloading(false));
                }}
              >
                {!downloading && <Download className="h-4 w-4" aria-hidden />}
                {t('bookings.invoice')}
              </Button>
              <Link to="/"><Button variant="secondary" className="w-full">{t('bookingSuccess.home')}</Button></Link>
            </div>
          </div>
          <div className="min-w-0">
            {booking.tour?.images[0] && (
              <div className="overflow-hidden rounded-2xl border border-slate-100">
                <SafeImage src={booking.tour.images[0]} alt="" className="h-36 w-full object-cover" />
                <p className="line-clamp-2 bg-slate-50 px-4 py-3 text-sm font-semibold leading-snug text-slate-900">{booking.tour.title}</p>
              </div>
            )}

            <dl className="mt-4 space-y-2.5 rounded-xl bg-slate-50 p-4 text-left text-sm">
              {rows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="shrink-0 text-slate-500">{label}</dt>
                  <dd className="min-w-0">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Card>

      {/* Modal QR thanh toán: quét bằng app ngân hàng rồi chờ admin xác nhận */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} label={t('checkout.payment')} wide>
        <h3 className="text-lg font-bold tracking-tight text-slate-900">
          {t('pay.payNow', { defaultValue: 'Thanh toán' }) as string} · {formatCurrency(booking.total)}
        </h3>
        {payInfo ? (
          <div className="mt-3">
            <div className="flex justify-center">
              <SafeImage
                src={vietQrUrl}
                alt="QR"
                className="h-56 w-56 rounded-2xl border border-slate-200 bg-white object-contain"
              />
            </div>
            {payInfo.demo && (
              <p className="mt-2 text-center text-xs font-semibold text-amber-600">
                {t('pay.demoBadge', { defaultValue: 'QR demo — không trừ tiền thật' }) as string}
              </p>
            )}
            <dl className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t('pay.bank', { defaultValue: 'Ngân hàng' }) as string}</dt>
                <dd className="font-semibold text-slate-900">{payInfo.bankName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t('pay.account', { defaultValue: 'Số tài khoản' }) as string}</dt>
                <dd className="font-mono font-semibold tabular-nums text-slate-900">{payInfo.accountNumber}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t('pay.content', { defaultValue: 'Nội dung' }) as string}</dt>
                <dd className="font-mono font-semibold tabular-nums text-slate-900">{booking.bookingCode}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t('checkout.total')}</dt>
                <dd className="font-bold tabular-nums text-orange-700">{formatCurrency(booking.total)}</dd>
              </div>
            </dl>
          </div>
        ) : payInfoFailed ? (
          <div className="mt-4 text-center">
            <p className="text-sm text-slate-500">
              {t('pay.infoFailed', { defaultValue: 'Không tải được thông tin chuyển khoản.' }) as string}
            </p>
            <Button
              variant="secondary"
              className="mt-3"
              onClick={() => {
                setPayInfoFailed(false);
                api
                  .get('/bookings/payment-info')
                  .then((res) => setPayInfo(res.data))
                  .catch(() => setPayInfoFailed(true));
              }}
            >
              {t('tours.retry')}
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-center text-sm text-slate-500">…</p>
        )}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            isLoading={claiming}
            onClick={() => {
              if (!booking || claiming) return;
              setClaiming(true);
              api
                .patch(`/bookings/${booking.id}/confirm-transfer`)
                .then(() => {
                  setClaimed(true);
                  setPayOpen(false);
                  toast.success(t('pay.claimed', { defaultValue: 'Đã ghi nhận, chờ shop xác nhận nhé!' }) as string);
                  setAttempt((a) => a + 1);
                })
                .catch((err) => toast.error(apiErrorMessage(err, t('checkout.bookingFailed'))))
                .finally(() => setClaiming(false));
            }}
            className="w-full sm:w-auto"
          >
            {t('pay.claimedBtn', { defaultValue: 'Tôi đã chuyển khoản' }) as string}
          </Button>
          <Button variant="secondary" onClick={() => setPayOpen(false)} className="w-full sm:w-auto">
            {t('bookings.dialogCancel')}
          </Button>
        </div>
      </Modal>
    </PageContainer>
  );
}
