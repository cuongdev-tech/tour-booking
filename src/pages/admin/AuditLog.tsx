import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../../services/api';
import { formatDateStr } from '../../i18n/format';
import type { Pagination } from '../../types';
import { Input, Select, TableCard, TableEmpty, Td, Th } from '../../components/ui/kit';
import { AdminPagination } from './Pagination';

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
  admin: { id: string; name: string; email: string };
}

const ACTIONS = ['', 'TOUR_CREATE', 'TOUR_UPDATE', 'TOUR_DELETE', 'BOOKING_STATUS', 'PAYMENT_STATUS', 'COUPON_CREATE', 'COUPON_UPDATE', 'COUPON_DELETE', 'USER_UPDATE', 'GUIDE_CREATE', 'GUIDE_UPDATE', 'GUIDE_DELETE', 'VEHICLE_CREATE', 'VEHICLE_UPDATE', 'VEHICLE_DELETE', 'TOURDATE_UPSERT', 'TOURDATE_DELETE'];

export function AuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(true);

  const load = (p = page) => {
    setLoading(true);
    api
      .get('/admin/audit-log', { params: { page: p, limit: 20, ...(action ? { action } : {}) } })
      .then((r) => {
        setRows(r.data.data);
        setPagination(r.data.pagination);
      })
      .catch((err) => toast.error(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    void load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, action]);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="max-w-60">
          <option value="">Tất cả hành động</option>
          {ACTIONS.filter(Boolean).map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
      </div>
      <TableCard className="mt-4">
        <thead>
          <tr>
            <Th>Thời gian</Th>
            <Th>Admin</Th>
            <Th>Hành động</Th>
            <Th>Đối tượng</Th>
            <Th>Chi tiết</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-100 align-top">
              <Td className="tabular-nums whitespace-nowrap">{formatDateStr(r.createdAt)}</Td>
              <Td><span className="font-medium">{r.admin.name}</span><br /><span className="text-xs text-slate-400">{r.admin.email}</span></Td>
              <Td><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold">{r.action}</span></Td>
              <Td className="font-mono text-xs">{r.entityType}{r.entityId ? ` · ${r.entityId.slice(-6)}` : ''}</Td>
              <Td className="max-w-80 truncate text-xs text-slate-500"><span title={JSON.stringify(r.detail)}>{JSON.stringify(r.detail)}</span></Td>
            </tr>
          ))}
          {rows.length === 0 && !loading && <TableEmpty colSpan={5}>Chưa có log</TableEmpty>}
        </tbody>
      </TableCard>
      {pagination && <AdminPagination pagination={pagination} onPage={setPage} />}
      <Input className="hidden" aria-hidden value="" onChange={() => undefined} />
    </div>
  );
}
