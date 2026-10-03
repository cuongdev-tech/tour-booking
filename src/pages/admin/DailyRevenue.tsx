import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../../services/api';
import { useEnumLabels } from '../../i18n/enums';
import { formatDateTimeStr } from '../../i18n/format';
import { formatCurrency } from '../../types';
import { Button, Pager, Skeleton, StatusBadge } from '../../components/ui/kit';

interface Tx {
  id: string;
  bookingId: string;
  bookingCode: string;
  time: string;
  tourTitle: string;
  customerName: string;
  customerEmail: string;
  method: string;
  amount: number;
  status: string;
}

interface Daily {
  date: string;
  goodsTotal: number;
  collectedTotal: number;
  guests: number;
  totalBookings: number;
  completedOrders: number;
  transactions: Tx[];
}

function todayLabel(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function DailyRevenue() {
  const { t } = useTranslation();
  const labels = useEnumLabels();
  const [date, setDate] = useState(todayLabel());
  const [applied, setApplied] = useState(todayLabel());
  const [data, setData] = useState<Daily | null>(null);
  const [loading, setLoading] = useState(false);
  const [txPage, setTxPage] = useState(1);
  const TX_PAGE_SIZE = 10;

  const load = (d: string = applied) => {
    setLoading(true);
    api
      .get('/admin/revenue/daily', { params: { date: d } })
      .then((r) => setData(r.data))
      .catch((err) => toast.error(apiErrorMessage(err, t('adminDaily.loadFailed') as string)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setTxPage(1);
    void load(applied);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied]);

  const txTotalPages = Math.max(1, Math.ceil((data?.transactions.length ?? 0) / TX_PAGE_SIZE));
  const txPagination =
    data && data.transactions.length > TX_PAGE_SIZE
      ? { page: Math.min(txPage, txTotalPages), limit: TX_PAGE_SIZE, total: data.transactions.length, totalPages: txTotalPages }
      : null;
  const txRows = data ? data.transactions.slice((Math.min(txPage, txTotalPages) - 1) * TX_PAGE_SIZE, Math.min(txPage, txTotalPages) * TX_PAGE_SIZE) : [];

  return (
    <div className="min-w-0 antialiased">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[22px] leading-7 font-extrabold tracking-tight text-neutral-900 uppercase">{t('adminDaily.title')}</h2>
          <p className="mt-1 text-[13px] font-normal text-neutral-400">{t('adminDaily.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[13px] font-normal text-neutral-500">
            {t('adminDaily.pickDate')}
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="min-h-10 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-900 outline-none focus:border-neutral-900"
            />
          </label>
          <button
            type="button"
            onClick={() => date && setApplied(date)}
            className="inline-flex min-h-10 items-center rounded-lg bg-neutral-900 px-5 py-2 text-[13px] font-bold tracking-wide text-white uppercase hover:bg-neutral-700"
          >
            {t('adminDaily.filter')}
          </button>
          <button
            type="button"
            onClick={() => {
              const today = todayLabel();
              setDate(today);
              setApplied(today);
            }}
            className="inline-flex min-h-10 items-center rounded-lg border border-red-400 px-3 py-2 text-[13px] font-normal text-red-500 hover:bg-red-50"
          >
            {t('adminDaily.today')}
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-500">{t('adminDaily.goods', { date: data.date })}</p>
              <p className="mt-2 text-[22px] leading-7 font-extrabold tabular-nums text-blue-600">{formatCurrency(data.goodsTotal).replace('₫', '').trim()} đ</p>
              <p className="mt-1 text-[12px] font-normal text-neutral-400">{t('adminDaily.goodsHint')}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-500">{t('adminDaily.collected', { date: data.date })}</p>
              <p className="mt-2 text-[22px] leading-7 font-extrabold tabular-nums text-emerald-600">{formatCurrency(data.collectedTotal).replace('₫', '').trim()} đ</p>
              <p className="mt-1 text-[12px] font-normal text-neutral-400">{t('adminDaily.collectedHint')}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-500">{t('adminDaily.guests')}</p>
              <p className="mt-2 text-[22px] leading-7 font-extrabold tabular-nums text-blue-600">{data.guests} {t('adminDaily.guestsUnit')}</p>
              <p className="mt-1 text-[12px] font-normal text-neutral-400">{t('adminDaily.bookingsCount', { count: data.totalBookings })}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-500">{t('adminDaily.completed')}</p>
              <p className="mt-2 text-[22px] leading-7 font-extrabold tabular-nums text-amber-500">{data.completedOrders} {t('adminRevenue.orderUnit')}</p>
              <p className="mt-1 text-[12px] font-normal text-neutral-400">{t('adminDaily.paidHint')}</p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <table className="w-full min-w-200 text-left">
              <thead>
                <tr className="border-b-2 border-neutral-900">
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-neutral-900">{t('adminDaily.code')}</th>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-neutral-900">{t('adminDaily.time')}</th>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-neutral-900">{t('adminDaily.content')}</th>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-neutral-900">{t('adminDaily.payType')}</th>
                  <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-neutral-900">{t('adminDaily.amount')}</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide text-neutral-900">{t('adminDaily.status')}</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-[13px] font-normal text-neutral-400">
                      {t('adminDaily.empty')}
                    </td>
                  </tr>
                )}
                {txRows.map((tx) => (
                  <tr key={tx.id} className="border-t border-neutral-100 transition-colors hover:bg-neutral-50/60">
                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-neutral-900">{tx.bookingCode || tx.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-[13px] font-normal tabular-nums text-neutral-600">
                      {formatDateTimeStr(tx.time)}
                    </td>
                    <td className="max-w-70 px-4 py-3">
                      <p className="truncate text-[13px] font-medium text-neutral-900" title={tx.tourTitle}>
                        {tx.tourTitle || '—'}
                      </p>
                      <p className="truncate text-[12px] font-normal text-neutral-400">
                        {tx.customerName} {tx.customerEmail ? `· ${tx.customerEmail}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[13px] font-normal text-neutral-600">{labels.paymentMethod(tx.method)}</td>
                    <td className="px-4 py-3 text-[13px] font-bold tabular-nums text-neutral-900">{formatCurrency(tx.amount)}</td>
                    <td className="px-4 py-3 text-right">
                      <StatusBadge status={tx.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager pagination={txPagination} onPage={setTxPage} />
        </>
      ) : (
        <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-8 text-center">
          <p className="text-[13px] font-normal text-neutral-500">{t('adminDaily.loadFailed')}</p>
          <Button variant="secondary" onClick={() => load()} className="mt-4">
            {t('common.retry')}
          </Button>
        </div>
      )}
    </div>
  );
}
