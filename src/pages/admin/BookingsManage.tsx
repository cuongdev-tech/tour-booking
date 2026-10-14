import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../../services/api';
import { useEnumLabels } from '../../i18n/enums';
import { formatDateStr } from '../../i18n/format';
import { formatCurrency, type Booking, type BookingStatus, type Pagination } from '../../types';
import { Button, Modal, RowAction, Select, Skeleton, StatusBadge, TableCard, TableEmpty, Td, Th } from '../../components/ui/kit';
import { RetryState } from '../../components/ui/kit';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { AdminPagination } from './Pagination';

const STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'];

/**
 * Next states the admin may pick from a row's current status.
 * Mirrors ALLOWED_TRANSITIONS in backend admin.service.ts — COMPLETED is terminal.
 */
function allowedNext(status: BookingStatus): BookingStatus[] {
  switch (status) {
    case 'PENDING': return ['PENDING', 'CONFIRMED', 'CANCELLED'];
    case 'CONFIRMED': return ['CONFIRMED', 'PENDING', 'COMPLETED', 'CANCELLED'];
    case 'CANCELLED': return ['CANCELLED', 'CONFIRMED'];
    case 'COMPLETED': return ['COMPLETED'];
  }
}

export function BookingsManage() {
  const { t } = useTranslation();
  const labels = useEnumLabels();
  const [searchParams, setSearchParams] = useSearchParams();
  const [bookings, setBookings] = useState<Booking[]>([]);
  // Filter + page live in the URL (shareable, survives refresh, back button works).
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [page, setPage] = useState(Math.max(1, Number(searchParams.get('page')) || 1));
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [detail, setDetail] = useState<Booking | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  // Money / seat-affecting transitions need an explicit confirm — a misclick on
  // CANCELLED / COMPLETED / PAID / FAILED can't be undone cleanly.
  const [pendingStatus, setPendingStatus] = useState<{ id: string; next: BookingStatus } | null>(null);
  const [pendingPayment, setPendingPayment] = useState<{ bookingId: string; next: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = async (p: number = page, s: string = status) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setLoadFailed(false);
    try {
      const r = await api.get('/admin/bookings', {
        params: { ...(s ? { status: s } : {}), page: p, limit: 10 },
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      setBookings(r.data.data);
      setPagination(r.data.pagination);
    } catch (err) {
      if ((err as { code?: string })?.code === 'ERR_CANCELED') return;
      setLoadFailed(true);
      toast.error(apiErrorMessage(err, t('adminBookings.loadFailed')));
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  };
  useEffect(() => {
    void load(page, status);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status]);

  // Mirror filter/page into the URL (replace, not push) — preserve nothing else
  // except when consuming ?open= (handled below, which clears it).
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams();
        if (status) next.set('status', status);
        if (page !== 1) next.set('page', String(page));
        // Drop a consumed ?open= (openDetail clears it explicitly too).
        const open = prev.get('open');
        if (open) next.set('open', open);
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, page]);

  // Deep-link from the notification bell (?open=<bookingId>): jump straight
  // to the booking detail so the admin can verify and confirm at once.
  // The param is consumed (removed) so a second bell click re-triggers.
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('open');
        return next;
      },
      { replace: true },
    );
    void openDetail(openId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const update = async (id: string, next: BookingStatus) => {
    try {
      await api.patch(`/admin/bookings/${id}`, { status: next });
      toast.success(t('adminBookings.updated'));
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('adminBookings.updateFailed')));
    }
  };

  const requestStatusChange = (id: string, next: BookingStatus) => {
    if (next === 'CANCELLED' || next === 'COMPLETED') setPendingStatus({ id, next });
    else void update(id, next);
  };

  const requestPaymentChange = (bookingId: string, next: string) => {
    if (next === 'PAID' || next === 'FAILED') setPendingPayment({ bookingId, next });
    else void updatePayment(bookingId, next);
  };

  const openDetail = async (id: string) => {
    setDetail(null);
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/admin/bookings/${id}`);
      setDetail(data.booking);
    } catch (err) {
      toast.error(apiErrorMessage(err, t('adminBookings.loadFailed')));
    } finally {
      setDetailLoading(false);
    }
  };

  /** Next payment states the admin may pick (mirrors the backend money state machine). */
  const paymentNext = (s: string): string[] =>
    s === 'PENDING'
      ? ['PENDING', 'PAID', 'FAILED']
      : s === 'AWAITING_CONFIRMATION'
        ? ['AWAITING_CONFIRMATION', 'PAID', 'FAILED', 'PENDING']
        : s === 'FAILED'
          ? ['FAILED', 'PENDING']
          : [s];

  const updatePayment = async (bookingId: string, next: string) => {
    try {
      await api.patch(`/admin/bookings/${bookingId}/payment`, { status: next });
      toast.success(t('adminBookings.updated'));
      await load();
      await openDetail(bookingId);
    } catch (err) {
      toast.error(apiErrorMessage(err, t('adminBookings.updateFailed')));
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <p className="text-sm text-slate-500">{t('adminBookings.count', { count: pagination?.total ?? bookings.length })}</p>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="max-w-50">
          <option value="">{t('adminBookings.allStatuses')}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{labels.bookingStatus(s)}</option>)}
        </Select>
      </div>
      <TableCard>
        {loading && bookings.length === 0 ? (
          <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        ) : loadFailed && bookings.length === 0 ? (
          <RetryState title={t('adminBookings.loadFailed')} onRetry={() => load()} retryLabel={t('common.retry')} />
        ) : (
          <table className="w-full min-w-200 text-left">
            <thead className="bg-slate-50">
              <tr><Th>{t('adminBookings.code')}</Th><Th>{t('adminBookings.tour')}</Th><Th>{t('adminBookings.total')}</Th><Th>{t('adminBookings.status')}</Th><Th right>{t('admin.actions')}</Th></tr>
            </thead>
            <tbody>
              {bookings.length === 0 && (
                <TableEmpty colSpan={5}>{t('tours.emptyTitle')}</TableEmpty>
              )}
            {bookings.map((b) => (
              <tr key={b.id} className="transition-colors hover:bg-slate-50/60">
                <Td className="font-mono text-xs tabular-nums">{b.bookingCode}</Td>
                <Td className="max-w-60 truncate">{(b as Booking & { tour?: { title: string } }).tour?.title ?? b.tourId}</Td>
                <Td className="tabular-nums">{formatCurrency(b.total)}</Td>
                <Td><StatusBadge status={b.bookingStatus} /></Td>
                <Td right>
                  <span className="inline-flex items-center gap-1">
                    <RowAction onClick={() => void openDetail(b.id)}>{t('bookings.details')}</RowAction>
                    <Select
                      value={b.bookingStatus}
                      onChange={(e) => {
                        // Same-status selection is a no-op (avoids a pointless PATCH + toast).
                        if (e.target.value !== b.bookingStatus) requestStatusChange(b.id, e.target.value as BookingStatus);
                      }}
                      aria-label={t('adminBookings.status')}
                      className="w-auto px-2 py-1.5 text-xs"
                      disabled={allowedNext(b.bookingStatus).length <= 1}
                    >
                      {allowedNext(b.bookingStatus).map((s) => <option key={s} value={s}>{labels.bookingStatus(s)}</option>)}
                    </Select>
                  </span>
                </Td>
              </tr>
            ))}
            </tbody>
          </table>
        )}
      </TableCard>
      <AdminPagination pagination={pagination} onPage={setPage} />
      <Modal open={detail !== null || detailLoading} onClose={() => setDetail(null)} label={t('bookings.details')} wide>
        {detailLoading && !detail ? (
          <p className="py-10 text-center text-sm tabular-nums text-slate-500">{t('bookings.details')}…</p>
        ) : detail ? (
          <div>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-mono text-xs font-bold tabular-nums tracking-widest text-orange-700">{detail.bookingCode}</p>
                <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-900">{detail.tour?.title ?? detail.tourId}</h3>
              </div>
              <span className="flex flex-wrap gap-1.5">
                <StatusBadge status={detail.bookingStatus} />
                <StatusBadge status={detail.payment?.status ?? 'PENDING'} />
              </span>
            </div>
            <dl className="mt-4 space-y-2.5 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t('adminUsers.user')}</dt>
                <dd className="text-right font-medium text-slate-900">{detail.user?.name ?? detail.customerName} <span className="block text-xs font-normal text-slate-400">{detail.user?.email ?? detail.customerEmail}</span></dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t('checkout.phone')}</dt>
                <dd className="tabular-nums text-slate-900">{detail.customerPhone}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t('tourDetails.travelDate')}</dt>
                <dd className="tabular-nums text-slate-900">{formatDateStr(detail.travelDate)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t('checkout.subtotal')}</dt>
                <dd className="tabular-nums text-slate-900">{formatCurrency(detail.subtotal)}</dd>
              </div>
              {(detail.children ?? 0) > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">{t('bookings.guestsSuffix', { count: detail.guests })}</dt>
                  <dd className="tabular-nums text-slate-900">{detail.adults ?? detail.guests} NL · {detail.children} TE</dd>
                </div>
              )}
              {Array.isArray(detail.addons) && detail.addons.length > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">{t('checkout.addons', { defaultValue: 'Dịch vụ bổ sung' }) as string}</dt>
                  <dd className="max-w-60 truncate text-right tabular-nums text-slate-900" title={detail.addons.map((a) => a.name).join(', ')}>
                    +{formatCurrency(detail.addonsTotal)}
                  </dd>
                </div>
              )}
              {detail.discount > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">{t('checkout.discount')}{detail.coupon ? ` (${detail.coupon.code})` : ''}</dt>
                  <dd className="tabular-nums text-emerald-600">-{formatCurrency(detail.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3 border-t border-slate-200 pt-2.5 font-bold">
                <dt className="text-slate-900">{t('checkout.total')}</dt>
                <dd className="tabular-nums text-orange-700">{formatCurrency(detail.total)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">{t('checkout.payment')}</dt>
                <dd className="flex items-center gap-2">
                  <span className="text-slate-900">{detail.payment ? labels.paymentMethod(detail.payment.method) : '—'}</span>
                  {detail.payment && (
                    <Select
                      value={detail.payment.status}
                      onChange={(e) => {
                        if (e.target.value !== detail.payment?.status) requestPaymentChange(detail.id, e.target.value);
                      }}
                      aria-label={t('adminBookings.status')}
                      className="w-auto px-2 py-1.5 text-xs"
                      disabled={paymentNext(detail.payment.status).length <= 1}
                    >
                      {paymentNext(detail.payment.status).map((s) => (
                        <option key={s} value={s}>{labels.paymentStatus(s)}</option>
                      ))}
                    </Select>
                  )}
                </dd>
              </div>
              {/* Đối chiếu sao kê rồi bấm xác nhận: khách đang chờ ở trang booking.
                  Booking CANCELLED không được thu tiền (backend cũng chặn). */}
              {(detail.payment?.status === 'PENDING' || detail.payment?.status === 'AWAITING_CONFIRMATION') &&
                detail.payment.method !== 'CASH' &&
                detail.bookingStatus !== 'CANCELLED' && (
                <div className="rounded-xl border border-dashed border-orange-300 bg-orange-50/50 p-3 text-sm">
                  <p className="text-slate-600">
                    {t('pay.verifyHint', {
                      defaultValue: 'Đối chiếu sao kê đúng số tiền và nội dung rồi bấm xác nhận:',
                    }) as string}
                  </p>
                  <p className="mt-1 font-mono text-sm font-bold tabular-nums text-slate-900">
                    {formatCurrency(detail.total)} · {detail.bookingCode}
                  </p>
                  <Button
                    className="mt-2 w-full"
                    onClick={() => setPendingPayment({ bookingId: detail.id, next: 'PAID' })}
                  >
                    {t('pay.confirmReceived', { defaultValue: 'Xác nhận đã nhận tiền' }) as string}
                  </Button>
                </div>
              )}
              {detail.note && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">{t('checkout.note')}</dt>
                  <dd className="max-w-60 text-right text-slate-900">{detail.note}</dd>
                </div>
              )}
            </dl>
            {detail.guestsList && detail.guestsList.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-900">{t('checkout.travelers', { count: detail.guestsList.length })}</p>
                <ul className="mt-2 space-y-1.5">
                  {detail.guestsList.map((g, i) => (
                    <li key={g.id} className="flex items-center gap-2.5 rounded-xl border border-slate-100 px-3 py-2 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold tabular-nums text-orange-700" aria-hidden>{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{g.fullName}</span>
                      {g.isChild && (
                        <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-700">TE</span>
                      )}
                      {(g.phone || g.email) && <span className="truncate text-xs tabular-nums text-slate-400">{[g.phone, g.email].filter(Boolean).join(' · ')}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-6 flex justify-end">
              <Button variant="secondary" onClick={() => setDetail(null)}>{t('bookings.dialogCancel')}</Button>
            </div>
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog
        open={pendingStatus !== null}
        title={labels.bookingStatus(pendingStatus?.next ?? 'CANCELLED')}
        message={`${pendingStatus?.id ?? ''} → ${pendingStatus ? labels.bookingStatus(pendingStatus.next) : ''}`}
        confirmLabel={t('common.confirm') as string}
        cancelLabel={t('common.cancel') as string}
        onClose={() => setPendingStatus(null)}
        onConfirm={() => {
          if (pendingStatus) void update(pendingStatus.id, pendingStatus.next).finally(() => setPendingStatus(null));
          else setPendingStatus(null);
        }}
      />
      <ConfirmDialog
        open={pendingPayment !== null}
        title={t('pay.confirmReceived', { defaultValue: 'Xác nhận đã nhận tiền' }) as string}
        message={`${pendingPayment?.bookingId ?? ''} → ${pendingPayment ? labels.paymentStatus(pendingPayment.next) : ''}`}
        confirmLabel={t('common.confirm') as string}
        cancelLabel={t('common.cancel') as string}
        onClose={() => setPendingPayment(null)}
        onConfirm={() => {
          if (pendingPayment) void updatePayment(pendingPayment.bookingId, pendingPayment.next).finally(() => setPendingPayment(null));
          else setPendingPayment(null);
        }}
      />
    </div>
  );
}
