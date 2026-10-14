import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../../services/api';
import { formatCurrency, type Pagination } from '../../types';
import { formatDateStr } from '../../i18n/format';
import { Button, Input, Select, TableCard, TableEmpty, Td, Th } from '../../components/ui/kit';
import { AdminPagination } from './Pagination';

interface WebhookEvent {
  id: string;
  provider: string;
  bookingCode: string;
  amount: number | null;
  gatewayRef: string | null;
  result: string;
  createdAt: string;
}

export function PaymentsReconcile() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);

  const load = (p = page) => {
    setLoading(true);
    api
      .get('/admin/payments/events', { params: { page: p, limit: 20, ...(code.trim() ? { bookingCode: code.trim() } : {}) } })
      .then((r) => {
        setEvents(r.data.data);
        setPagination(r.data.pagination);
      })
      .catch((err) => toast.error(apiErrorMessage(err, t('tours.loadError'))))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    void load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="TB-XXXXXX" className="max-w-45 uppercase" aria-label="Booking code" />
        <Button variant="secondary" onClick={() => { setPage(1); load(1); }}>Lọc</Button>
        <Button
          variant="secondary"
          onClick={() => {
            api.post('/payments/sweep').then((r) => toast.success(`Đã nhả ${r.data.released ?? 0} hold hết hạn`)).catch((err) => toast.error(apiErrorMessage(err)));
          }}
        >
          Chạy nhả hold ngay
        </Button>
      </div>
      <TableCard className="mt-4">
        <thead>
          <tr>
            <Th>Thời gian</Th>
            <Th>Provider</Th>
            <Th>Booking</Th>
            <Th>Số tiền</Th>
            <Th>Ref</Th>
            <Th>Kết quả</Th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-t border-slate-100">
              <Td className="tabular-nums">{formatDateStr(e.createdAt)}</Td>
              <Td>{e.provider}</Td>
              <Td className="font-mono">{e.bookingCode}</Td>
              <Td className="tabular-nums">{e.amount != null ? formatCurrency(e.amount) : '—'}</Td>
              <Td className="font-mono">{e.gatewayRef ?? '—'}</Td>
              <Td>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${e.result === 'captured' || e.result === 'already_paid' ? 'bg-emerald-100 text-emerald-700' : e.result === 'amount_mismatch' || e.result === 'bad_signature' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                  {e.result}
                </span>
              </Td>
            </tr>
          ))}
          {events.length === 0 && !loading && <TableEmpty colSpan={6}>Chưa có webhook nào</TableEmpty>}
        </tbody>
      </TableCard>
      <Select className="hidden" aria-hidden value="" onChange={() => undefined}><option value="" /></Select>
      {pagination && <AdminPagination pagination={pagination} onPage={setPage} />}
    </div>
  );
}
